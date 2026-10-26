const db = require('../config/db');

const MOTIVOS = ['fraude', 'informacion_falsa', 'fotos_no_corresponden', 'precio_enganoso', 'contenido_inapropiado', 'otro'];
const MAX_REPORTES_POR_DIA = 5;
// Una publicación revisada y aprobada recientemente no se oculta con un solo reporte
const DIAS_PROTECCION_REVISION = 30;
const REPORTES_PARA_PAUSA_SI_REVISADA = 2;

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * POST /api/inmuebles/:id/reportes  (requireAuth)  { motivo, descripcion? }
 *
 * Política de moderación:
 *  - Reportar inicia una revisión; no prueba que la publicación sea falsa.
 *  - Pausa preventiva: la publicación pasa a 'en_revision' (oculta) con el primer reporte,
 *    salvo que Roumix la haya revisado y aprobado en los últimos 30 días; en ese caso
 *    se necesitan reportes de al menos 2 personas distintas.
 *  - Un usuario reporta cada inmueble una sola vez, máximo 5 reportes en 24 horas,
 *    y nunca su propia publicación.
 */
async function crearReporte(req, res) {
  const inmuebleId = Number(req.params.id);
  if (!Number.isInteger(inmuebleId) || inmuebleId < 1) throw errorHttp(400, 'id no válido.');

  const { motivo } = req.body || {};
  const descripcion = typeof (req.body || {}).descripcion === 'string' ? req.body.descripcion.trim() : '';
  if (!MOTIVOS.includes(motivo)) throw errorHttp(400, 'Elige un motivo válido para el reporte.');
  if (descripcion.length > 1000) throw errorHttp(400, 'La explicación admite máximo 1000 caracteres.');
  if (motivo === 'otro' && descripcion.length < 10) {
    throw errorHttp(400, 'Si eliges "Otro", explica brevemente el problema (mínimo 10 caracteres).');
  }

  const { rows: [{ recientes }] } = await db.query(
    "SELECT count(*)::int AS recientes FROM reportes WHERE reportante_id = $1 AND created_at > now() - interval '24 hours'",
    [req.usuario.id]
  );
  if (recientes >= MAX_REPORTES_POR_DIA) {
    throw errorHttp(429, 'Has enviado muchos reportes hoy. Inténtalo de nuevo mañana.');
  }

  const client = await db.pool.connect();
  let pausada = false;
  try {
    await client.query('BEGIN');

    // Solo se pueden reportar publicaciones visibles para el público
    const { rows } = await client.query(
      `SELECT i.id, i.titulo, i.propietario_id, i.moderacion, i.revisado_en
       FROM inmuebles i LEFT JOIN usuarios u ON u.id = i.propietario_id
       WHERE i.id = $1 AND i.estado = 'disponible' AND i.moderacion = 'aprobada'
         AND (u.id IS NULL OR u.estado = 'activo')
       FOR UPDATE OF i`,
      [inmuebleId]
    );
    if (rows.length === 0) throw errorHttp(404, 'Esta publicación no existe o ya está en revisión.');
    const inmueble = rows[0];

    if (inmueble.propietario_id === req.usuario.id) {
      throw errorHttp(403, 'No puedes reportar tu propia publicación.');
    }

    try {
      await client.query(
        'INSERT INTO reportes (inmueble_id, reportante_id, motivo, descripcion) VALUES ($1, $2, $3, $4)',
        [inmuebleId, req.usuario.id, motivo, descripcion || null]
      );
    } catch (error) {
      if (error.code === '23505') throw errorHttp(409, 'Ya reportaste esta publicación. Roumix revisará el caso.');
      throw error;
    }

    const { rows: [{ pendientes }] } = await client.query(
      "SELECT count(DISTINCT reportante_id)::int AS pendientes FROM reportes WHERE inmueble_id = $1 AND estado = 'pendiente'",
      [inmuebleId]
    );
    const revisadaReciente = inmueble.revisado_en &&
      Date.now() - new Date(inmueble.revisado_en).getTime() < DIAS_PROTECCION_REVISION * 24 * 3600 * 1000;
    pausada = !revisadaReciente || pendientes >= REPORTES_PARA_PAUSA_SI_REVISADA;

    if (pausada) {
      await client.query("UPDATE inmuebles SET moderacion = 'en_revision' WHERE id = $1", [inmuebleId]);
      await client.query(
        `INSERT INTO moderacion_historial
           (inmueble_id, inmueble_titulo, usuario_afectado_id, admin_id, accion, moderacion_anterior, moderacion_nueva, justificacion)
         VALUES ($1, $2, $3, NULL, 'pausa_preventiva', 'aprobada', 'en_revision', $4)`,
        [inmuebleId, inmueble.titulo, inmueble.propietario_id,
          `Revisión preventiva por reporte (motivo: ${motivo}). No implica que la publicación sea falsa.`]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // No se revela al reportante si la publicación fue ocultada ni datos de otros reportes
  res.status(201).json({
    status: 'success',
    message: 'Gracias por avisarnos. El equipo de Roumix revisará la publicación y tomará una decisión según nuestras reglas.'
  });
}

module.exports = { crearReporte, MOTIVOS };
