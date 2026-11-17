/**
 * Condiciones de la comisión: aviso a los propietarios cuando se publica una versión nueva.
 *
 * GET  /api/admin/condiciones          → versión vigente y cuántos propietarios faltan por avisar / aceptar
 * POST /api/admin/condiciones/avisar   → aviso en la plataforma + correo, UNA vez por propietario y versión
 *
 * Se avisa a los propietarios aprobados que aún no aceptaron la versión vigente.
 */
const db = require('../config/db');
const verificacion = require('../services/verificacionService');
const notificaciones = require('../services/notificacionesService');
const { crearAviso } = require('../services/avisosService');

const PENDIENTES = `
  FROM verificaciones_propietario v
  JOIN usuarios u ON u.id = v.propietario_id AND u.estado = 'activo'
  WHERE v.estado = 'aprobado'
    AND NOT (v.acepta_comision AND v.version_condiciones = $1)`;

/** GET /api/admin/condiciones */
async function resumen(req, res) {
  const version = verificacion.VERSION_CONDICIONES;
  const { rows: [t] } = await db.query(
    `SELECT count(*)::int AS por_aceptar,
            count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM condiciones_avisos a WHERE a.propietario_id = v.propietario_id AND a.version = $1))::int AS por_avisar
     ${PENDIENTES}`, [version]);
  const { rows: [a] } = await db.query(
    "SELECT count(*)::int AS aceptaron FROM verificaciones_propietario WHERE estado = 'aprobado' AND acepta_comision AND version_condiciones = $1", [version]);
  res.json({
    status: 'success',
    data: { version, texto: verificacion.CONDICIONES_COMISION, cambios: verificacion.CAMBIOS_CONDICIONES, ...t, aceptaron: a.aceptaron }
  });
}

/** POST /api/admin/condiciones/avisar */
async function avisar(req, res) {
  const version = verificacion.VERSION_CONDICIONES;
  const { rows } = await db.query(
    `SELECT u.id, u.nombre, u.email ${PENDIENTES}
       AND NOT EXISTS (SELECT 1 FROM condiciones_avisos a WHERE a.propietario_id = v.propietario_id AND a.version = $1)`, [version]);
  const { avisados, correos } = await avisarPropietarios(rows, req.usuario.id, notificaciones.urlBase(req));
  res.json({
    status: 'success',
    message: avisados
      ? `Avisaste a ${avisados} propietario(s) en la plataforma${correos ? ` y a ${correos} por correo` : ''}.`
      : 'No hay propietarios pendientes de aviso para esta versión.',
    data: { avisados, correos }
  });
}

/**
 * Avisa a una lista de propietarios ({ id, nombre, email }) de la versión vigente.
 * Cada propietario recibe el aviso una sola vez por versión (condiciones_avisos).
 */
async function avisarPropietarios(lista, autorId, urlBase) {
  const version = verificacion.VERSION_CONDICIONES;
  let avisados = 0;
  let correos = 0;
  for (const p of lista) {
    // Primero se registra (si otro administrador avisa a la vez, el propietario no recibe dos avisos)
    const { rowCount } = await db.query(
      `INSERT INTO condiciones_avisos (propietario_id, version, avisado_por) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [p.id, version, autorId]);
    if (!rowCount) continue;
    avisados += 1;
    await crearAviso({
      usuarioId: p.id, tipo: 'verificacion',
      titulo: 'Roumix actualizó las condiciones de la comisión',
      cuerpo: 'Nuevo: débito automático mensual (5 % de cada mes cobrado). Revísalas y acéptalas en Mi verificación.',
      enlace: 'verificacion.html#condiciones'
    });
    const enviado = await notificaciones.notificarCondicionesNuevas({ propietario: p, version, cambios: verificacion.CAMBIOS_CONDICIONES, urlBase });
    if (enviado) {
      correos += 1;
      await db.query('UPDATE condiciones_avisos SET correo_enviado = true WHERE propietario_id = $1 AND version = $2', [p.id, version]);
    }
  }
  return { avisados, correos };
}

module.exports = { resumen, avisar, avisarPropietarios };
