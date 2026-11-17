/**
 * "Paga mi acudiente": enlace de pago único para que un familiar pague el primer mes.
 *
 * Estudiante (con sesión):
 *   POST   /api/pagos/:id/enlace   → crea un enlace nuevo (anula el anterior). Vence en 24 h.
 *   DELETE /api/pagos/:id/enlace   → anula el enlace activo.
 * Acudiente (SIN cuenta; el código del enlace es la autorización):
 *   GET  /api/acudiente/:codigo            → datos mínimos del pago (sin datos privados)
 *   POST /api/acudiente/:codigo/wompi      → abre la pasarela  { nombre, correo }
 *   POST /api/acudiente/:codigo/confirmar  → confirma con Wompi { transaccionId }
 *
 * Seguridad:
 *   - El código tiene 256 bits aleatorios; en la base de datos solo se guarda su huella SHA-256.
 *   - Solo sirve para pagar ESE pago, por ESE monto, con el contrato formalizado y antes de vencer.
 *   - El acudiente no ve la dirección, el contrato ni datos de contacto de nadie.
 */
const crypto = require('crypto');
const db = require('../config/db');
const wompi = require('../services/wompiService');
const pagos = require('../services/pagosService');
const notificaciones = require('../services/notificacionesService');
const { auditar } = require('../services/auditoriaService');
const wc = require('./wompiController');

const HORAS_VIGENCIA = 24;
const { errorHttp, enTransaccion } = wc;

const huella = (codigo) => crypto.createHash('sha256').update(String(codigo), 'utf8').digest('hex');
const codigoValido = (c) => /^[A-Za-z0-9_-]{40,60}$/.test(String(c || ''));

function idEntero(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorHttp(400, 'Número de pago no válido.');
  return id;
}

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || 'el estudiante';

// ============================================================================
// Estudiante
// ============================================================================

/** POST /api/pagos/:id/enlace */
async function crearEnlace(req, res) {
  if (!wompi.config().activo) throw errorHttp(503, 'El pago por enlace necesita la pasarela de pagos activa.');
  const id = idEntero(req.params.id);
  const codigo = crypto.randomBytes(32).toString('base64url');

  const enlace = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(wc.SELECT_BLOQUEO, [id]);
    const p = rows[0];
    if (!p || p.estudiante_id !== req.usuario.id) throw errorHttp(404, 'No tienes un pago con ese número.');
    const bloqueo = wc.bloqueoDeCobro(p);
    if (bloqueo) throw errorHttp(409, bloqueo);
    // Crear uno nuevo anula el anterior (solo hay un enlace activo por pago)
    const { rowCount: anulados } = await cliente.query(
      "UPDATE pagos_enlaces SET estado = 'revocado' WHERE pago_id = $1 AND estado = 'activo'", [id]);
    const { rows: [nuevo] } = await cliente.query(
      `INSERT INTO pagos_enlaces (pago_id, token_huella, expira_en, creado_por)
       VALUES ($1, $2, now() + make_interval(hours => $3), $4) RETURNING id, expira_en`,
      [id, huella(codigo), HORAS_VIGENCIA, req.usuario.id]
    );
    await pagos.registrarEvento(cliente, {
      pagoId: id, tipo: 'enlace_creado',
      detalle: `Enlace de pago para el acudiente (vence en ${HORAS_VIGENCIA} horas)${anulados ? '; el enlace anterior dejó de servir' : ''}.`,
      autorId: req.usuario.id, autorRol: 'estudiante'
    });
    await auditar({ actor: req.usuario, accion: 'enlace_pago_creado', entidad: 'pago', entidadId: id,
      resumen: `Enlace de pago para acudiente creado (vence ${nuevo.expira_en.toISOString()}).`, ip: req.ip }, cliente);
    return { ...nuevo, monto: p.monto };
  });

  res.json({
    status: 'success',
    message: `Enlace creado. Vence en ${HORAS_VIGENCIA} horas.`,
    data: {
      // El código solo se muestra ahora: Roumix guarda únicamente su huella
      url: `${notificaciones.urlBase(req)}/pages/pagar.html?c=${codigo}`,
      expiraEn: enlace.expira_en,
      monto: enlace.monto
    }
  });
}

/** DELETE /api/pagos/:id/enlace */
async function anularEnlace(req, res) {
  const id = idEntero(req.params.id);
  await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query('SELECT estudiante_id FROM pagos WHERE id = $1', [id]);
    if (!rows.length || rows[0].estudiante_id !== req.usuario.id) throw errorHttp(404, 'No tienes un pago con ese número.');
    const { rowCount } = await cliente.query(
      "UPDATE pagos_enlaces SET estado = 'revocado' WHERE pago_id = $1 AND estado = 'activo'", [id]);
    if (!rowCount) throw errorHttp(409, 'Este pago no tiene un enlace activo.');
    await pagos.registrarEvento(cliente, { pagoId: id, tipo: 'enlace_anulado', detalle: 'El estudiante anuló el enlace de pago del acudiente.',
      autorId: req.usuario.id, autorRol: 'estudiante' });
  });
  res.json({ status: 'success', message: 'Anulaste el enlace: ya no sirve para pagar.' });
}

/** Enlace activo del pago (para mostrarle al estudiante cuándo vence). Nunca devuelve el código. */
async function enlaceActivo(pagoId) {
  const { rows } = await db.query(
    "SELECT expira_en FROM pagos_enlaces WHERE pago_id = $1 AND estado = 'activo' AND expira_en > now()", [pagoId]);
  return rows[0] ? { expiraEn: rows[0].expira_en } : null;
}

// ============================================================================
// Acudiente (público)
// ============================================================================

/**
 * Busca el enlace por su código y explica por qué no sirve, si es el caso.
 * Devuelve { enlace, p } o lanza un error con un mensaje claro.
 */
async function cargarEnlace(cliente, codigo, { bloquear = false } = {}) {
  if (!codigoValido(codigo)) throw errorHttp(404, 'Este enlace de pago no existe. Revisa que lo copiaste completo.');
  const { rows } = await cliente.query(
    `SELECT * FROM pagos_enlaces WHERE token_huella = $1${bloquear ? ' FOR UPDATE' : ''}`, [huella(codigo)]);
  const enlace = rows[0];
  if (!enlace) throw errorHttp(404, 'Este enlace de pago no existe. Revisa que lo copiaste completo.');
  const { rows: pr } = await cliente.query(bloquear ? wc.SELECT_BLOQUEO : wc.SELECT_BLOQUEO.replace(' FOR UPDATE OF p', ''), [enlace.pago_id]);
  return { enlace, p: pr[0] };
}

/** Estado del enlace en palabras: listo | vencido | anulado | pagado | en_proceso | cerrado */
async function estadoEnlace(cliente, enlace, p) {
  if (p.estado === 'aprobado' || p.estado === 'en_disputa' || enlace.estado === 'usado') return 'pagado';
  if (enlace.estado === 'revocado') return 'anulado';
  if (new Date(enlace.expira_en) <= new Date()) return 'vencido';
  if (wc.bloqueoDeCobro(p)) return 'cerrado';
  const { rows } = await cliente.query("SELECT 1 FROM pagos_intentos_wompi WHERE pago_id = $1 AND estado = 'PENDING' LIMIT 1", [p.id]);
  return rows.length ? 'en_proceso' : 'listo';
}

const MENSAJES = {
  pagado: 'Este arriendo ya está pagado. ¡Gracias!',
  anulado: 'Este enlace ya no sirve: el estudiante lo anuló o creó uno nuevo. Pídele el enlace más reciente.',
  vencido: `Este enlace venció (dura ${HORAS_VIGENCIA} horas). Pídele al estudiante que cree uno nuevo desde Roumix.`,
  cerrado: 'Este pago ya no se puede hacer. El estudiante puede escribirle al equipo de Roumix.',
  en_proceso: 'Ya hay un pago en proceso con el banco. Espera unos minutos a que se confirme antes de intentar de nuevo.'
};

/** GET /api/acudiente/:codigo */
async function verEnlace(req, res) {
  const { enlace, p } = await cargarEnlace(db, req.params.codigo);
  const estado = await estadoEnlace(db, enlace, p);
  const cfg = wompi.config();
  res.json({
    status: 'success',
    data: {
      estado,
      mensaje: MENSAJES[estado] || null,
      // Solo lo necesario para que el acudiente sepa qué está pagando
      estudiante: primerNombre(p.estudiante_nombre),
      inmueble: p.inmueble_titulo,
      concepto: 'Primer mes de arriendo',
      monto: p.monto,
      expiraEn: enlace.expira_en,
      modo: cfg.activo ? cfg.modo : null,
      referencia: estado === 'pagado' ? p.referencia : null
    }
  });
}

function validarPagador(body) {
  const nombre = String((body || {}).nombre || '').trim().replace(/\s+/g, ' ');
  const correo = String((body || {}).correo || '').trim().toLowerCase();
  if (nombre.length < 3 || nombre.length > 120) throw errorHttp(400, 'Escribe tu nombre completo (entre 3 y 120 caracteres).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 160) throw errorHttp(400, 'Escribe un correo válido: ahí te llega el comprobante de Wompi.');
  return { nombre, correo };
}

/** POST /api/acudiente/:codigo/wompi  { nombre, correo } */
async function iniciarEnlace(req, res) {
  const cfg = wompi.config();
  if (!cfg.activo) throw errorHttp(503, 'La pasarela de pagos no está disponible en este momento.');
  const pagador = validarPagador(req.body);
  const codigo = req.params.codigo;

  const datos = await enTransaccion(async (cliente) => {
    const { enlace, p } = await cargarEnlace(cliente, codigo, { bloquear: true });
    const estado = await estadoEnlace(cliente, enlace, p);
    if (estado !== 'listo') throw errorHttp(estado === 'en_proceso' ? 409 : 410, MENSAJES[estado]);
    return wc.crearIntento(cliente, cfg, p, { autorRol: 'sistema', origen: 'acudiente', enlaceId: enlace.id, pagadorNombre: pagador.nombre });
  });

  res.json({
    status: 'success',
    data: {
      ...datos,
      urlRetorno: `${notificaciones.urlBase(req)}/pages/pagar.html?c=${codigo}`,
      // El correo del acudiente solo se le pasa a Wompi (para su comprobante); Roumix no lo guarda
      cliente: { correo: pagador.correo, nombre: pagador.nombre }
    }
  });
}

/** POST /api/acudiente/:codigo/confirmar  { transaccionId } */
async function confirmarEnlace(req, res) {
  const { p } = await cargarEnlace(db, req.params.codigo);
  // Nunca se confía en el navegador: se consulta a Wompi y la transacción debe ser de este pago
  const tx = await wompi.consultarTransaccion(String((req.body || {}).transaccionId || '').trim());
  const { rows: propio } = await db.query(
    "SELECT 1 FROM pagos_intentos_wompi WHERE referencia = $1 AND pago_id = $2 AND origen = 'acudiente'", [String(tx.reference || ''), p.id]);
  if (!propio.length) throw errorHttp(404, 'Esa transacción no corresponde a este enlace de pago.');

  const r = await wc.aplicarTransaccion(tx, { ip: req.ip, req });
  const { rows: [actual] } = await db.query('SELECT estado, referencia FROM pagos WHERE id = $1', [p.id]);
  res.json({
    status: 'success',
    message: actual.estado === 'aprobado'
      ? `¡Pago aprobado! Referencia ${actual.referencia}. ${primerNombre(p.estudiante_nombre)} y Roumix ya fueron avisados.`
      : wompi.mensajeHumano(String(tx.status).toUpperCase(), tx.status_message),
    data: { estado: actual.estado, estadoWompi: tx.status, resultado: r.resultado, referencia: actual.estado === 'aprobado' ? actual.referencia : null }
  });
}

module.exports = { crearEnlace, anularEnlace, enlaceActivo, verEnlace, iniciarEnlace, confirmarEnlace, HORAS_VIGENCIA, huella };
