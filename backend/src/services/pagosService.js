/**
 * Pagos SIMULADOS del primer canon.
 *
 * Roumix aún no tiene un proveedor de pagos autorizado, así que el "proveedor" es un
 * simulador interno y todo queda marcado como demostrativo: no se mueve dinero real
 * y no se guardan datos de tarjetas ni cuentas.
 */
const crypto = require('crypto');
const { VERSION_CONDICIONES } = require('./verificacionService');

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
 * Requiere que el propietario haya aceptado las condiciones de la comisión.
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
  if (!s.acepta_comision) return { habilitado: false, motivo: 'comision_no_aceptada' };

  const { comision, neto } = repartir(s.canon_mensual);
  const { rows: [pago] } = await cliente.query(
    `INSERT INTO pagos (solicitud_id, contrato_id, estudiante_id, propietario_id, monto, porcentaje_comision, comision, neto_propietario)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [s.id, s.contrato_id, s.estudiante_id, s.propietario_id, s.canon_mensual, PORCENTAJE_COMISION, comision, neto]
  );
  await registrarEvento(cliente, { pagoId: pago.id, tipo: 'habilitado', monto: s.canon_mensual, detalle: 'Pago del primer canon habilitado (simulado).' });
  await moverSolicitud(cliente, {
    solicitudId: s.id, de: 'contrato_formalizado', a: 'pago_pendiente',
    notaEstudiante: 'Ya puedes pagar el primer mes a través de Roumix (pago demostrativo).',
    notaPropietario: 'Se habilitó el pago del primer mes para el estudiante.',
    notaInterna: `Pago #${pago.id} habilitado: canon ${s.canon_mensual}, comisión ${comision}, neto ${neto}.`
  });
  return { habilitado: true, pagoId: pago.id, estudianteId: s.estudiante_id, propietarioId: s.propietario_id };
}

module.exports = {
  PORCENTAJE_COMISION,
  VERSION_CONDICIONES,
  repartir,
  referencia,
  registrarEvento,
  moverSolicitud,
  habilitarPago
};
