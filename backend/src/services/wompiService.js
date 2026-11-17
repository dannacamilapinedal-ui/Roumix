/**
 * Integración con Wompi (pasarela de pagos de Bancolombia).
 *
 * Roumix usa el WIDGET de Wompi: los datos de la tarjeta o de la cuenta los escribe el
 * estudiante dentro de la ventana de Wompi y nunca pasan por Roumix. Aquí solo se:
 *   1. Firma cada intento (firma de integridad): así nadie puede cambiar el monto en el navegador.
 *   2. Verifica la firma de los eventos que Wompi envía al webhook.
 *   3. Consulta a Wompi el estado real de una transacción (nunca se confía en el navegador).
 *
 * Variables de entorno (TODAS secretas menos la pública; nunca en el frontend ni en GitHub):
 *   WOMPI_PUBLIC_KEY        pub_test_… (pruebas) o pub_prod_… (dinero real)
 *   WOMPI_PRIVATE_KEY       prv_test_… / prv_prod_… (opcional: consulta de transacciones)
 *   WOMPI_INTEGRITY_SECRET  test_integrity_… / prod_integrity_…
 *   WOMPI_EVENTS_SECRET     test_events_… / prod_events_…
 * Si falta alguna de las obligatorias, Wompi queda desactivado y Roumix sigue con el simulador.
 */
const crypto = require('crypto');

const API = {
  sandbox: 'https://sandbox.wompi.co/v1',
  produccion: 'https://production.wompi.co/v1'
};

// Quita espacios y comillas que a veces se pegan por error al copiar la llave
const leer = (nombre) => String(process.env[nombre] || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();

/**
 * Configuración actual. { activo, modo, motivo?, detalle? } — nunca se devuelve un secreto.
 * "detalle" dice QUÉ variable falla y con qué debería empezar (sin mostrar su contenido),
 * para poder corregirla en Vercel sin adivinar.
 */
function config() {
  const publica = leer('WOMPI_PUBLIC_KEY');
  const privada = leer('WOMPI_PRIVATE_KEY');
  const integridad = leer('WOMPI_INTEGRITY_SECRET');
  const eventos = leer('WOMPI_EVENTS_SECRET');
  const faltan = [['WOMPI_PUBLIC_KEY', publica], ['WOMPI_INTEGRITY_SECRET', integridad], ['WOMPI_EVENTS_SECRET', eventos]]
    .filter(([, v]) => !v).map(([n]) => n);
  if (faltan.length) return { activo: false, motivo: 'faltan_llaves', detalle: `Falta: ${faltan.join(', ')}.` };

  const modo = publica.startsWith('pub_prod_') ? 'produccion' : publica.startsWith('pub_test_') ? 'sandbox' : null;
  if (!modo) return { activo: false, motivo: 'llave_publica_invalida', detalle: 'WOMPI_PUBLIC_KEY debe empezar por pub_test_ (pruebas) o pub_prod_ (producción).' };
  // Mezclar llaves de pruebas y de producción daría firmas inválidas: mejor no activar
  const p = modo === 'produccion' ? 'prod_' : 'test_';
  const esperado = [
    ['WOMPI_INTEGRITY_SECRET', integridad, `${p}integrity_`],
    ['WOMPI_EVENTS_SECRET', eventos, `${p}events_`],
    ['WOMPI_PRIVATE_KEY', privada, modo === 'produccion' ? 'prv_prod_' : 'prv_test_']
  ].filter(([, valor, prefijo]) => valor && !valor.startsWith(prefijo));
  if (esperado.length) {
    return {
      activo: false,
      motivo: 'llaves_de_ambientes_distintos',
      detalle: `La llave pública es de ${modo === 'produccion' ? 'producción' : 'pruebas'}, pero ` +
        esperado.map(([n, , prefijo]) => `${n} no empieza por ${prefijo}`).join('; ') + '.'
    };
  }
  return { activo: true, modo, publica, privada, integridad, eventos, api: API[modo] };
}

const sha256 = (texto) => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

function iguales(a, b) {
  const x = Buffer.from(String(a || '').toLowerCase());
  const y = Buffer.from(String(b || '').toLowerCase());
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/**
 * Firma de integridad del widget: SHA256(referencia + monto_en_centavos + moneda + secreto).
 * Se calcula SOLO en el servidor (el secreto nunca sale de aquí).
 */
function firmaIntegridad({ referencia, montoCentavos, moneda = 'COP' }, cfg = config()) {
  return sha256(`${referencia}${montoCentavos}${moneda}${cfg.integridad}`);
}

/** Lee una propiedad anidada: valorEn({ transaction: { id: 1 } }, 'transaction.id') → 1 */
function valorEn(objeto, ruta) {
  return String(ruta).split('.').reduce((v, clave) => (v === null || v === undefined ? v : v[clave]), objeto);
}

/**
 * Verifica que un evento del webhook lo envió Wompi:
 * SHA256(valores de signature.properties en orden + timestamp + secreto de eventos) === checksum.
 * Las propiedades firmadas pueden cambiar, por eso se leen del propio evento.
 */
function verificarEvento(evento, checksumCabecera, cfg = config()) {
  if (!cfg.activo || !evento || typeof evento !== 'object') return false;
  const firma = evento.signature || {};
  if (!Array.isArray(firma.properties) || !firma.properties.length || !firma.checksum || !evento.timestamp) return false;
  const valores = firma.properties.map((ruta) => {
    const v = valorEn(evento.data, ruta);
    return v === null || v === undefined ? '' : String(v);
  }).join('');
  const calculado = sha256(`${valores}${evento.timestamp}${cfg.eventos}`);
  if (!iguales(calculado, firma.checksum)) return false;
  // Si también llegó en la cabecera, debe coincidir
  return !checksumCabecera || iguales(calculado, checksumCabecera);
}

/** Consulta el estado real de una transacción en Wompi. */
async function consultarTransaccion(transaccionId, cfg = config()) {
  if (!cfg.activo) throw Object.assign(new Error('Wompi no está configurado.'), { status: 503 });
  if (!/^[\w-]{6,60}$/.test(String(transaccionId || ''))) throw Object.assign(new Error('Número de transacción no válido.'), { status: 400 });
  const control = new AbortController();
  const tiempo = setTimeout(() => control.abort(), 10000);
  try {
    const res = await fetch(`${cfg.api}/transactions/${encodeURIComponent(transaccionId)}`, {
      headers: cfg.privada ? { Authorization: `Bearer ${cfg.privada}` } : {},
      signal: control.signal
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 404) throw Object.assign(new Error('Wompi no encontró esa transacción.'), { status: 404 });
    if (!res.ok || !json.data) throw Object.assign(new Error('Wompi no respondió como se esperaba. Intenta de nuevo en un momento.'), { status: 502 });
    return json.data;
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('Wompi tardó demasiado en responder. Tu pago no se perdió: revisa en unos minutos.'), { status: 504 });
    if (error.status) throw error;
    throw Object.assign(new Error('No pudimos comunicarnos con Wompi. Revisa tu conexión e intenta de nuevo.'), { status: 502 });
  } finally {
    clearTimeout(tiempo);
  }
}

const METODOS = {
  CARD: 'tarjeta',
  PSE: 'pse',
  NEQUI: 'nequi',
  BANCOLOMBIA_TRANSFER: 'boton_bancolombia',
  BANCOLOMBIA_QR: 'qr_bancolombia',
  DAVIPLATA: 'daviplata',
  BANCOLOMBIA_COLLECT: 'corresponsal_bancario',
  BANCOLOMBIA_BNPL: 'bnpl_bancolombia',
  SU_PLUS: 'su_plus'
};

const NOMBRES_METODO = {
  tarjeta: 'Tarjeta', pse: 'PSE', nequi: 'Nequi', boton_bancolombia: 'Botón Bancolombia',
  qr_bancolombia: 'QR Bancolombia', daviplata: 'Daviplata', corresponsal_bancario: 'Corresponsal bancario',
  bnpl_bancolombia: 'Compra y paga después', su_plus: 'SU+ Pay', otro: 'Otro medio'
};

const metodoDesdeWompi = (tipo) => METODOS[String(tipo || '').toUpperCase()] || 'otro';

/**
 * Mensaje claro para el estudiante según el resultado de Wompi.
 * Diferencia fondos insuficientes, rechazo del banco, verificación 3D Secure y errores técnicos.
 */
function mensajeHumano(estado, mensajeWompi) {
  const detalle = String(mensajeWompi || '').toLowerCase();
  if (estado === 'APPROVED') return 'Pago aprobado.';
  if (estado === 'PENDING') return 'Tu pago está en proceso. Algunos medios (como PSE) tardan unos minutos en confirmarse; te avisaremos.';
  if (estado === 'VOIDED') return 'La transacción fue anulada y no se hizo ningún cobro.';
  if (estado === 'ERROR') return 'Hubo un error técnico con el medio de pago y no se hizo ningún cobro. Intenta de nuevo o usa otro medio.';
  if (/fondos|insufficient|saldo/.test(detalle)) return 'El pago no pasó por fondos insuficientes. Revisa tu saldo o usa otro medio de pago.';
  if (/3ds|3d secure|autentica/.test(detalle)) return 'No se completó la verificación de seguridad de tu banco (3D Secure). Intenta de nuevo y confirma el pago en tu app o mensaje del banco.';
  if (/venc|expir/.test(detalle)) return 'La tarjeta está vencida o los datos de vencimiento no coinciden.';
  if (/cancel|abandon|usuario/.test(detalle)) return 'El pago se canceló antes de terminar. No se hizo ningún cobro.';
  return 'Tu banco o medio de pago rechazó la transacción. No se hizo ningún cobro; puedes intentarlo de nuevo o usar otro medio.';
}

module.exports = {
  config,
  firmaIntegridad,
  verificarEvento,
  consultarTransaccion,
  metodoDesdeWompi,
  mensajeHumano,
  NOMBRES_METODO,
  sha256
};
