/**
 * Pago del primer canon con Wompi.
 *
 * Flujo:
 *   1. POST /api/pagos/:id/wompi            → Roumix crea un intento con referencia única y
 *                                              firma el monto (el navegador no puede cambiarlo).
 *   2. El estudiante paga en el widget de Wompi (tarjeta, PSE, Nequi, Bancolombia, Daviplata…).
 *   3. POST /api/pagos/:id/wompi/confirmar   → al cerrar el widget, Roumix CONSULTA a Wompi el
 *                                              estado real de la transacción.
 *   4. POST /api/wompi/eventos (webhook)     → Wompi avisa el resultado final (también si el
 *                                              estudiante cerró la página). Se verifica la firma.
 * Los pasos 3 y 4 usan la misma función (aplicarTransaccion) y son idempotentes: si llegan
 * los dos, o el mismo evento llega varias veces, el pago se aprueba una sola vez.
 *
 * Reglas que se mantienen: solo paga el estudiante del contrato, solo con el contrato
 * FORMALIZADO y la solicitud esperando el pago.
 */
const crypto = require('crypto');
const db = require('../config/db');
const wompi = require('../services/wompiService');
const pagos = require('../services/pagosService');
const notificaciones = require('../services/notificacionesService');
const { crearAviso } = require('../services/avisosService');
const { auditar } = require('../services/auditoriaService');

const MAX_INTENTOS = 5;           // pagos rechazados permitidos
const MAX_APERTURAS_HORA = 10;    // veces que se puede abrir la pasarela por hora

function errorHttp(status, message) {
  return Object.assign(new Error(message), { status });
}

function idEntero(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorHttp(400, 'Número de pago no válido.');
  return id;
}

async function enTransaccion(fn) {
  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

/** Referencia única por intento. Ej: RMX-12-20261115-4F9A2C1B */
function nuevaReferencia(pagoId) {
  const fecha = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  return `RMX-${pagoId}-${fecha}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const SELECT_BLOQUEO = `
  SELECT p.*, c.estado AS contrato_estado, s.estado AS solicitud_estado, s.inmueble_titulo, v.version_condiciones
  FROM pagos p
  JOIN contratos c ON c.id = p.contrato_id
  JOIN solicitudes s ON s.id = p.solicitud_id
  LEFT JOIN verificaciones_propietario v ON v.propietario_id = p.propietario_id
  WHERE p.id = $1 FOR UPDATE OF p`;

/** Motivo por el que un pago no se puede cobrar ahora (o null si se puede). */
function bloqueoDeCobro(p) {
  if (p.contrato_estado !== 'formalizado') return 'El contrato todavía no está formalizado.';
  if (!['pendiente', 'fallido'].includes(p.estado)) return 'Este pago ya no está pendiente.';
  if (p.solicitud_estado !== 'pago_pendiente') return 'La solicitud no está esperando el pago.';
  return null;
}

// ============================================================================
// 1. Iniciar el pago (el estudiante abre la pasarela)
// ============================================================================

/** POST /api/pagos/:id/wompi */
async function iniciar(req, res) {
  const cfg = wompi.config();
  if (!cfg.activo) throw errorHttp(503, 'La pasarela de pagos no está disponible en este momento.');
  const id = idEntero(req.params.id);

  const intento = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(SELECT_BLOQUEO, [id]);
    const p = rows[0];
    if (!p || p.estudiante_id !== req.usuario.id) throw errorHttp(404, 'No tienes un pago con ese número.');
    const bloqueo = bloqueoDeCobro(p);
    if (bloqueo) throw errorHttp(409, bloqueo);
    if (p.intentos >= MAX_INTENTOS) throw errorHttp(429, 'Superaste el número de intentos. Escríbele al equipo de Roumix.');

    // Un pago en proceso (p. ej. PSE esperando al banco) no se puede duplicar
    const { rows: abiertos } = await cliente.query(
      `SELECT referencia FROM pagos_intentos_wompi WHERE pago_id = $1 AND estado = 'PENDING' LIMIT 1`, [id]);
    if (abiertos.length) {
      throw errorHttp(409, 'Ya tienes un pago en proceso con tu banco. Espera unos minutos a que se confirme antes de intentar de nuevo.');
    }
    const { rows: [{ n }] } = await cliente.query(
      `SELECT count(*)::int AS n FROM pagos_intentos_wompi WHERE pago_id = $1 AND created_at > now() - interval '1 hour'`, [id]);
    if (n >= MAX_APERTURAS_HORA) throw errorHttp(429, 'Abriste la pasarela muchas veces. Espera un momento e intenta de nuevo.');

    const referencia = nuevaReferencia(id);
    const montoCentavos = p.monto * 100;
    await cliente.query(
      `INSERT INTO pagos_intentos_wompi (pago_id, referencia, monto_centavos, moneda, modo, creado_por)
       VALUES ($1, $2, $3, 'COP', $4, $5)`,
      [id, referencia, montoCentavos, cfg.modo, req.usuario.id]
    );
    await pagos.registrarEvento(cliente, {
      pagoId: id, tipo: 'intento_iniciado', referencia, monto: p.monto,
      detalle: `Pasarela Wompi abierta${cfg.modo === 'sandbox' ? ' (modo de pruebas)' : ''}.`,
      autorId: req.usuario.id, autorRol: 'estudiante'
    });
    return { referencia, montoCentavos };
  });

  // Datos para el widget. La firma protege referencia + monto + moneda.
  res.json({
    status: 'success',
    data: {
      llavePublica: cfg.publica,
      modo: cfg.modo,
      referencia: intento.referencia,
      montoCentavos: intento.montoCentavos,
      moneda: 'COP',
      firmaIntegridad: wompi.firmaIntegridad({ referencia: intento.referencia, montoCentavos: intento.montoCentavos, moneda: 'COP' }, cfg),
      urlRetorno: `${notificaciones.urlBase(req)}/pages/pago.html?pago=${id}`,
      cliente: { correo: req.usuario.email, nombre: req.usuario.nombre }
    }
  });
}

// ============================================================================
// Aplicar el resultado de una transacción (lo usan confirmar y el webhook)
// ============================================================================

/**
 * Aplica el estado de una transacción de Wompi al pago de Roumix.
 * tx: objeto "transaction" de Wompi (id, reference, status, amount_in_cents, currency, payment_method_type, status_message).
 * Devuelve { resultado, pagoId?, mensaje? } y deja programados los avisos a enviar.
 */
async function aplicarTransaccion(tx, { actor = null, ip = null, req = null } = {}) {
  const cfg = wompi.config();
  const estado = String(tx.status || '').toUpperCase();
  if (!['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(estado)) return { resultado: 'estado_desconocido' };

  const r = await enTransaccion(async (cliente) => {
    const { rows: [it] } = await cliente.query(
      'SELECT * FROM pagos_intentos_wompi WHERE referencia = $1 FOR UPDATE', [String(tx.reference || '')]);
    if (!it) return { resultado: 'referencia_desconocida' };

    const { rows } = await cliente.query(SELECT_BLOQUEO, [it.pago_id]);
    const p = rows[0];
    const metodo = wompi.metodoDesdeWompi(tx.payment_method_type);
    const mensaje = wompi.mensajeHumano(estado, tx.status_message);

    // El monto y la moneda deben ser exactamente los firmados
    if (Number(tx.amount_in_cents) !== Number(it.monto_centavos) || String(tx.currency) !== it.moneda) {
      await cliente.query(`UPDATE pagos_intentos_wompi SET estado = 'ERROR', wompi_transaccion_id = $2, mensaje = $3 WHERE id = $1`,
        [it.id, tx.id, 'El monto no coincide con el firmado.']);
      if (estado === 'APPROVED') {
        await pagos.registrarEvento(cliente, { pagoId: p.id, tipo: 'requiere_devolucion', referencia: it.referencia,
          detalle: `Wompi aprobó un monto distinto (${tx.amount_in_cents} centavos). Revisar y devolver desde el panel de Wompi.` });
      }
      await auditar({ actor, actorRol: actor ? null : 'sistema', accion: 'pago_monto_no_coincide', entidad: 'pago', entidadId: p.id,
        resumen: `Transacción ${tx.id} con monto distinto al firmado.`, datos: { referencia: it.referencia, estado, monto_centavos: tx.amount_in_cents }, ip }, cliente);
      return { resultado: 'monto_no_coincide', pagoId: p.id, p, aviso: estado === 'APPROVED' ? 'requiere_devolucion' : null, tx };
    }

    // Idempotencia: el mismo estado no se aplica dos veces y un estado final no vuelve a "en proceso"
    const finales = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];
    if (it.estado === estado || (finales.includes(it.estado) && estado === 'PENDING')) {
      return { resultado: 'sin_cambios', pagoId: p.id, estado: p.estado, mensaje };
    }
    await cliente.query(
      `UPDATE pagos_intentos_wompi SET estado = $2, wompi_transaccion_id = $3, metodo = $4, mensaje = $5 WHERE id = $1`,
      [it.id, estado, tx.id, metodo, String(tx.status_message || mensaje).slice(0, 300)]
    );

    if (estado === 'PENDING') {
      await pagos.registrarEvento(cliente, { pagoId: p.id, tipo: 'intento_en_proceso', referencia: it.referencia, monto: p.monto,
        detalle: `${wompi.NOMBRES_METODO[metodo]}: esperando la confirmación del banco.` });
      return { resultado: 'en_proceso', pagoId: p.id, estado: p.estado, mensaje };
    }

    if (estado === 'APPROVED') {
      // Llegó dinero pero el pago ya no se podía cobrar (doble pago, pago cancelado…): se marca para devolver
      const bloqueo = bloqueoDeCobro(p);
      if (bloqueo) {
        await pagos.registrarEvento(cliente, { pagoId: p.id, tipo: 'requiere_devolucion', referencia: it.referencia, monto: p.monto,
          detalle: `Wompi aprobó la transacción ${tx.id}, pero el pago no estaba pendiente (${bloqueo}). Hay que devolverla desde el panel de Wompi.` });
        await auditar({ actor, actorRol: actor ? null : 'sistema', accion: 'pago_requiere_devolucion', entidad: 'pago', entidadId: p.id,
          resumen: `Cobro de más: transacción ${tx.id} aprobada con el pago en estado "${p.estado}".`, datos: { referencia: it.referencia, transaccion: tx.id }, ip }, cliente);
        return { resultado: 'requiere_devolucion', pagoId: p.id, p, aviso: 'requiere_devolucion', tx };
      }
      await pagos.aprobar(cliente, p, {
        ref: it.referencia, metodo,
        detalle: `${wompi.NOMBRES_METODO[metodo]}: aprobado por Wompi${it.modo === 'sandbox' ? ' (modo de pruebas)' : ''} · transacción ${tx.id}.`,
        simulado: false, modoWompi: it.modo, transaccionId: tx.id, actor, autorRol: actor ? 'estudiante' : 'sistema', ip
      });
      return { resultado: 'aprobado', pagoId: p.id, estado: 'aprobado', mensaje, p: { ...p, referencia: it.referencia }, aviso: 'aprobado' };
    }

    // DECLINED, VOIDED o ERROR: se registra el rechazo (solo si el pago seguía pendiente)
    if (['pendiente', 'fallido'].includes(p.estado)) {
      await cliente.query(
        `UPDATE pagos SET estado = 'fallido', intentos = intentos + 1, metodo = $2, ultimo_error = $3 WHERE id = $1`,
        [p.id, metodo, mensaje]
      );
    }
    await pagos.registrarEvento(cliente, { pagoId: p.id, tipo: 'intento_rechazado', referencia: it.referencia, monto: p.monto,
      detalle: `${wompi.NOMBRES_METODO[metodo]}: ${mensaje}` });
    await auditar({ actor, actorRol: actor ? null : 'sistema', accion: 'pago_rechazado', entidad: 'pago', entidadId: p.id,
      resumen: `Wompi respondió ${estado} (${it.referencia}).`, datos: { metodo, estado, modo: it.modo }, ip }, cliente);
    return { resultado: 'rechazado', pagoId: p.id, estado: ['pendiente', 'fallido'].includes(p.estado) ? 'fallido' : p.estado, mensaje };
  });

  // Avisos fuera de la transacción (si un correo falla, el pago ya quedó bien registrado)
  if (r.aviso === 'aprobado') {
    const etiqueta = cfg.modo === 'sandbox' ? ' (modo de pruebas)' : '';
    await crearAviso({ usuarioId: r.p.estudiante_id, tipo: 'solicitud', titulo: `Pago confirmado${etiqueta}`, cuerpo: `${r.p.inmueble_titulo} · ${r.p.referencia}`, enlace: `pago.html?id=${r.pagoId}` });
    await crearAviso({ usuarioId: r.p.propietario_id, tipo: 'solicitud', titulo: 'El estudiante pagó el primer mes', cuerpo: r.p.inmueble_titulo, enlace: `pago.html?id=${r.pagoId}` });
    await notificaciones.notificarPago({ pago: { ...r.p, simulado: false, modo_wompi: cfg.modo }, evento: 'aprobado', urlBase: notificaciones.urlBase(req) });
  }
  if (r.aviso === 'requiere_devolucion') {
    await notificaciones.notificarPago({ pago: r.p, evento: 'requiere_devolucion', detalle: `Transacción ${r.tx.id} (${r.tx.reference})`, urlBase: notificaciones.urlBase(req) });
  }
  return r;
}

// ============================================================================
// 3. Confirmar al cerrar el widget o al volver del banco
// ============================================================================

/** POST /api/pagos/:id/wompi/confirmar  { transaccionId } */
async function confirmar(req, res) {
  const id = idEntero(req.params.id);
  const transaccionId = String((req.body || {}).transaccionId || '').trim();
  // Solo el estudiante dueño del pago puede pedir la confirmación
  const { rows } = await db.query('SELECT estudiante_id FROM pagos WHERE id = $1', [id]);
  if (!rows.length || rows[0].estudiante_id !== req.usuario.id) throw errorHttp(404, 'No tienes un pago con ese número.');

  // Nunca se confía en lo que dice el navegador: se le pregunta a Wompi
  const tx = await wompi.consultarTransaccion(transaccionId);
  const { rows: propio } = await db.query('SELECT 1 FROM pagos_intentos_wompi WHERE referencia = $1 AND pago_id = $2', [String(tx.reference || ''), id]);
  if (!propio.length) throw errorHttp(404, 'Esa transacción no corresponde a este pago.');

  const r = await aplicarTransaccion(tx, { actor: req.usuario, ip: req.ip, req });
  const { rows: [p] } = await db.query('SELECT estado, referencia, ultimo_error FROM pagos WHERE id = $1', [id]);
  res.json({
    status: 'success',
    message: r.resultado === 'aprobado' || p.estado === 'aprobado'
      ? `Pago aprobado. Referencia ${p.referencia}.`
      : wompi.mensajeHumano(String(tx.status).toUpperCase(), tx.status_message),
    data: { id, estado: p.estado, estadoWompi: tx.status, resultado: r.resultado, referencia: p.referencia }
  });
}

// ============================================================================
// 4. Webhook: Wompi avisa el resultado (sin sesión; se verifica la firma)
// ============================================================================

/** POST /api/wompi/eventos */
async function recibirEvento(req, res) {
  const cfg = wompi.config();
  if (!cfg.activo) return res.status(503).json({ status: 'error', message: 'Wompi no está configurado.' });

  const evento = req.body || {};
  if (!wompi.verificarEvento(evento, req.get('X-Event-Checksum'), cfg)) {
    console.warn('⚠️ Webhook de Wompi con firma inválida rechazado.');
    return res.status(401).json({ status: 'error', message: 'Firma inválida.' });
  }

  const tx = (evento.data && evento.data.transaction) || {};
  const ambiente = evento.environment === 'prod' ? 'produccion' : 'sandbox';
  // Guardar primero: el mismo evento reenviado no se procesa dos veces
  const { rows: nuevo } = await db.query(
    `INSERT INTO wompi_eventos (evento, checksum, transaccion_id, referencia, estado, ambiente, resultado, datos)
     VALUES ($1, $2, $3, $4, $5, $6, 'recibido', $7)
     ON CONFLICT (checksum) DO NOTHING RETURNING id`,
    [String(evento.event || '').slice(0, 60), String(evento.signature.checksum).toLowerCase(), tx.id || null,
      tx.reference || null, tx.status || null, ambiente, JSON.stringify({ transaction: tx, sent_at: evento.sent_at })]
  );
  if (!nuevo.length) return res.json({ status: 'success', resultado: 'duplicado' });

  let resultado = 'ignorado';
  try {
    if (evento.event !== 'transaction.updated') resultado = 'evento_no_usado';
    else if (ambiente !== cfg.modo) resultado = 'ambiente_distinto';
    else resultado = (await aplicarTransaccion(tx, { req })).resultado;
  } catch (error) {
    // Se borra el registro para que el reintento de Wompi sí se procese
    await db.query('DELETE FROM wompi_eventos WHERE id = $1', [nuevo[0].id]).catch(() => {});
    throw error;
  }

  await db.query('UPDATE wompi_eventos SET resultado = $2 WHERE id = $1', [nuevo[0].id, resultado]);
  // Siempre 200 a un evento válido: si no, Wompi lo reenvía una y otra vez
  res.json({ status: 'success', resultado });
}

module.exports = { iniciar, confirmar, recibirEvento, aplicarTransaccion, nuevaReferencia };
