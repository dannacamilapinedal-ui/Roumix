/**
 * Pagos del primer canon.
 *
 * Con Wompi configurado (ver wompiService.js) el pago es real: en modo de pruebas
 * (sandbox) no mueve dinero, y con llaves de producción sí. Sin Wompi, el "proveedor"
 * es un simulador interno y todo queda marcado como demostrativo.
 * Roumix nunca guarda datos de tarjetas ni de cuentas.
 */
const crypto = require('crypto');
const { VERSION_CONDICIONES } = require('./verificacionService');
const { auditar } = require('./auditoriaService');

const PORCENTAJE_COMISION = 10;

/** Reparto del primer canon: 10 % para Roumix (a cargo del propietario) y el resto para el propietario. */
function repartir(monto) {
  const comision = Math.round((monto * PORCENTAJE_COMISION) / 100);
  return { comision, neto: monto - comision };
}

/** Referencia legible y única para una transacción simulada. Ej: SIM-20261113-4F9A2C */
function referencia(prefijo) {
  const fecha = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefijo}-${fecha}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function registrarEvento(cliente, { pagoId, tipo, referencia: ref = null, monto = null, detalle = null, autorId = null, autorRol = 'sistema' }) {
  await cliente.query(
    `INSERT INTO pagos_eventos (pago_id, tipo, referencia, monto, detalle, autor_id, autor_rol)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [pagoId, tipo, ref, monto, detalle, autorId, autorRol]
  );
}

/** Cambio de estado de la solicitud hecho por el sistema (queda en su historial). */
async function moverSolicitud(cliente, { solicitudId, de, a, notaEstudiante = null, notaPropietario = null, notaInterna = null }) {
  const { rowCount } = await cliente.query(
    `UPDATE solicitudes SET estado = $3::varchar,
       cerrada_en = CASE WHEN $3::varchar IN ('rechazada', 'completada', 'cancelada') THEN now() ELSE cerrada_en END
     WHERE id = $1 AND estado = ANY($2::varchar[])`,
    [solicitudId, [].concat(de), a]
  );
  if (rowCount === 0) return false;
  await cliente.query(
    `INSERT INTO solicitudes_historial (solicitud_id, estado_anterior, estado_nuevo, autor_rol, nota_estudiante, nota_propietario, nota_interna)
     VALUES ($1, $2, $3, 'sistema', $4, $5, $6)`,
    [solicitudId, [].concat(de)[0], a, notaEstudiante, notaPropietario, notaInterna]
  );
  return true;
}

/**
 * Habilita el pago del primer canon de una solicitud con contrato formalizado.
 * Requiere que el propietario haya aceptado las condiciones VIGENTES de la comisión: con ellas acepta
 * también el débito automático obligatorio de los meses siguientes.
 * Debe llamarse dentro de una transacción (cliente).
 * Devuelve { habilitado, pagoId?, motivo? }.
 */
async function habilitarPago(cliente, solicitudId) {
  const { rows } = await cliente.query(
    `SELECT s.id, s.estado, c.id AS contrato_id, c.canon_mensual, c.estudiante_id, c.propietario_id,
            v.acepta_comision, v.version_condiciones
     FROM solicitudes s
     JOIN contratos c ON c.solicitud_id = s.id AND c.estado = 'formalizado'
     LEFT JOIN verificaciones_propietario v ON v.propietario_id = c.propietario_id
     WHERE s.id = $1
     FOR UPDATE OF s`,
    [solicitudId]
  );
  const s = rows[0];
  if (!s) return { habilitado: false, motivo: 'sin_contrato' };
  if (s.estado !== 'contrato_formalizado') return { habilitado: false, motivo: 'estado' };
  if (!(s.acepta_comision && s.version_condiciones === VERSION_CONDICIONES)) return { habilitado: false, motivo: 'comision_no_aceptada' };

  const { comision, neto } = repartir(s.canon_mensual);
  const { rows: [pago] } = await cliente.query(
    `INSERT INTO pagos (solicitud_id, contrato_id, estudiante_id, propietario_id, monto, porcentaje_comision, comision, neto_propietario)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [s.id, s.contrato_id, s.estudiante_id, s.propietario_id, s.canon_mensual, PORCENTAJE_COMISION, comision, neto]
  );
  await registrarEvento(cliente, { pagoId: pago.id, tipo: 'habilitado', monto: s.canon_mensual, detalle: 'Pago del primer canon habilitado.' });
  await moverSolicitud(cliente, {
    solicitudId: s.id, de: 'contrato_formalizado', a: 'pago_pendiente',
    notaEstudiante: 'Ya puedes pagar el primer mes a través de Roumix.',
    notaPropietario: 'Se habilitó el pago del primer mes para el estudiante.',
    notaInterna: `Pago #${pago.id} habilitado: canon ${s.canon_mensual}, comisión ${comision}, neto ${neto}.`
  });
  return { habilitado: true, pagoId: pago.id, estudianteId: s.estudiante_id, propietarioId: s.propietario_id };
}

/**
 * Marca como "arrendado" el inmueble de la solicitud (si estaba disponible o pausado):
 * deja de verse en las búsquedas y no recibe solicitudes nuevas.
 */
async function marcarArrendado(cliente, solicitudId) {
  await cliente.query(
    `UPDATE inmuebles i SET estado = 'arrendado'
     FROM solicitudes s WHERE s.id = $1 AND i.id = s.inmueble_id AND i.estado IN ('disponible', 'pausado')`,
    [solicitudId]
  );
}

/**
 * Vuelve a publicar el inmueble cuando el arriendo no siguió adelante (devolución del pago),
 * solo si lo había marcado arrendado y no hay otro arriendo vigente en él.
 * Devuelve true si el inmueble volvió a quedar disponible.
 */
async function liberarInmueble(cliente, solicitudId) {
  const { rowCount } = await cliente.query(
    `UPDATE inmuebles i SET estado = 'disponible'
     FROM solicitudes s
     WHERE s.id = $1 AND i.id = s.inmueble_id AND i.estado = 'arrendado'
       AND NOT EXISTS (
         SELECT 1 FROM solicitudes o JOIN contratos c ON c.solicitud_id = o.id AND c.estado = 'formalizado'
         WHERE o.inmueble_id = i.id AND o.id <> s.id AND o.estado IN ('pagado', 'completada')
           AND (c.fecha_inicio + make_interval(months => c.duracion_meses)) > CURRENT_DATE)`,
    [solicitudId]
  );
  return rowCount > 0;
}

/**
 * Registra un pago del primer canon como APROBADO (lo usan el simulador y Wompi).
 * - Marca el pago, registra la comisión del 10 % (a cargo del propietario) y deja
 *   pendiente el desembolso del resto.
 * - Mueve la solicitud a "pagado" y deja rastro en la auditoría.
 * Debe llamarse dentro de una transacción, con el pago ya bloqueado (FOR UPDATE) y
 * validado (contrato formalizado, pago pendiente o fallido, solicitud en pago_pendiente).
 *
 * p: fila del pago (con solicitud_id, propietario_id, monto, comision, neto_propietario,
 *    porcentaje_comision y version_condiciones).
 * opciones: { ref, metodo, detalle, simulado, modoWompi?, transaccionId?, actor?, autorRol, ip? }
 */
async function aprobar(cliente, p, { ref, metodo, detalle, simulado, modoWompi = null, transaccionId = null, actor = null, autorRol, ip = null }) {
  await cliente.query(
    `UPDATE pagos SET estado = 'aprobado', intentos = intentos + 1, metodo = $2, referencia = $3, aprobado_en = now(),
       ultimo_error = NULL, simulado = $4, proveedor = $5, modo_wompi = $6, wompi_transaccion_id = $7
     WHERE id = $1`,
    [p.id, metodo, ref, simulado, simulado ? 'simulador_roumix' : 'wompi', modoWompi, transaccionId]
  );
  await registrarEvento(cliente, {
    pagoId: p.id, tipo: 'intento_aprobado', referencia: ref, monto: p.monto, detalle,
    autorId: actor ? actor.id : null, autorRol
  });
  // Comisión del 10 % respaldada por la versión de condiciones que aceptó el propietario
  await cliente.query(
    `INSERT INTO comisiones (pago_id, propietario_id, monto, porcentaje, version_condiciones) VALUES ($1, $2, $3, $4, $5)`,
    [p.id, p.propietario_id, p.comision, p.porcentaje_comision, p.version_condiciones || VERSION_CONDICIONES]
  );
  await cliente.query(
    `INSERT INTO desembolsos (pago_id, propietario_id, monto) VALUES ($1, $2, $3)`,
    [p.id, p.propietario_id, p.neto_propietario]
  );
  // Con más de un mes, el contrato pide el débito automático para los meses siguientes
  const { rows: [k] } = await cliente.query('SELECT duracion_meses FROM contratos WHERE id = $1', [p.contrato_id]);
  const variosMeses = Boolean(k && k.duracion_meses >= 2);
  const etiqueta = simulado ? 'pago demostrativo' : (modoWompi === 'sandbox' ? 'Wompi, modo de pruebas' : 'Wompi');
  await moverSolicitud(cliente, {
    solicitudId: p.solicitud_id, de: 'pago_pendiente', a: 'pagado',
    notaEstudiante: `Roumix confirmó tu pago del primer mes (referencia ${ref}, ${etiqueta}).${variosMeses ? ' Ahora activa el débito automático de los meses siguientes: tu contrato lo pide y sin él no queda listo tu arriendo.' : ''}`,
    notaPropietario: 'El estudiante pagó el primer mes. Roumix gestionará tu desembolso. Tu publicación quedó como arrendada y ya no aparece en las búsquedas.',
    notaInterna: `Pago #${p.id} aprobado (${ref}, ${etiqueta}). Comisión ${p.comision}, desembolso pendiente ${p.neto_propietario}.`
  });
  // Con el arriendo cerrado, la publicación deja de aparecer en las búsquedas
  await marcarArrendado(cliente, p.solicitud_id);
  await auditar({
    actor, actorRol: actor ? null : 'sistema', accion: 'pago_aprobado', entidad: 'pago', entidadId: p.id,
    resumen: `Pago del primer canon aprobado (${ref}, ${etiqueta}).`,
    datos: { metodo, monto: p.monto, comision: p.comision, neto_propietario: p.neto_propietario, simulado, modo_wompi: modoWompi, transaccion: transaccionId },
    ip
  }, cliente);
}

module.exports = {
  aprobar,
  marcarArrendado,
  liberarInmueble,
  PORCENTAJE_COMISION,
  VERSION_CONDICIONES,
  repartir,
  referencia,
  registrarEvento,
  moverSolicitud,
  habilitarPago
};
