const db = require('../config/db');

// Todas las rutas de este controlador pasan por requireAuth + requireRol('admin')

const MODERACIONES = ['aprobada', 'en_revision', 'requiere_cambios', 'rechazada', 'retirada'];

// Decisión del administrador -> nueva moderación y resultado de los reportes pendientes
const DECISIONES = {
  aprobar: { moderacion: 'aprobada', reportes: 'no_procede', mensaje: 'Roumix revisó tu publicación y está aprobada.' },
  solicitar_cambios: { moderacion: 'requiere_cambios', reportes: 'procedente', mensaje: 'Roumix necesita que corrijas tu publicación antes de mostrarla de nuevo.' },
  rechazar: { moderacion: 'rechazada', reportes: 'procedente', mensaje: 'Tu publicación no cumple las reglas de Roumix y no se mostrará.' },
  retirar: { moderacion: 'retirada', reportes: 'procedente', mensaje: 'Roumix retiró tu publicación de forma definitiva.' }
};

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function idEntero(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorHttp(400, 'id no válido.');
  return id;
}

function texto(valor, campo, min, max) {
  const limpio = typeof valor === 'string' ? valor.trim() : '';
  if (limpio.length < min) throw errorHttp(400, `${campo} debe tener al menos ${min} caracteres.`);
  if (limpio.length > max) throw errorHttp(400, `${campo} admite máximo ${max} caracteres.`);
  return limpio;
}

function patron(valor) {
  return `%${String(valor).slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * GET /api/admin/resumen
 */
async function resumen(req, res) {
  const [usuarios, inmuebles, reportes] = await Promise.all([
    db.query(`SELECT rol, estado, count(*)::int AS total FROM usuarios GROUP BY rol, estado`),
    db.query(`SELECT moderacion, estado, count(*)::int AS total FROM inmuebles GROUP BY moderacion, estado`),
    db.query(`SELECT estado, count(*)::int AS total FROM reportes GROUP BY estado`)
  ]);

  const suma = (filas, filtro) => filas.filter(filtro).reduce((t, f) => t + f.total, 0);
  res.json({
    status: 'success',
    data: {
      usuarios: {
        total: suma(usuarios.rows, () => true),
        estudiantes: suma(usuarios.rows, (f) => f.rol === 'estudiante'),
        propietarios: suma(usuarios.rows, (f) => f.rol === 'propietario'),
        admins: suma(usuarios.rows, (f) => f.rol === 'admin'),
        suspendidos: suma(usuarios.rows, (f) => f.estado === 'suspendido')
      },
      inmuebles: {
        total: suma(inmuebles.rows, () => true),
        visibles: suma(inmuebles.rows, (f) => f.moderacion === 'aprobada' && f.estado === 'disponible'),
        enRevision: suma(inmuebles.rows, (f) => f.moderacion === 'en_revision'),
        requiereCambios: suma(inmuebles.rows, (f) => f.moderacion === 'requiere_cambios'),
        rechazadosORetirados: suma(inmuebles.rows, (f) => f.moderacion === 'rechazada' || f.moderacion === 'retirada')
      },
      reportes: {
        pendientes: suma(reportes.rows, (f) => f.estado === 'pendiente'),
        total: suma(reportes.rows, () => true)
      }
    }
  });
}

/**
 * GET /api/admin/reportes?estado=pendiente|procedente|no_procede|todos
 */
async function listarReportes(req, res) {
  const estado = req.query.estado || 'pendiente';
  const params = [];
  let filtro = '';
  if (estado !== 'todos') {
    if (!['pendiente', 'procedente', 'no_procede'].includes(estado)) throw errorHttp(400, 'Filtro de estado no válido.');
    params.push(estado);
    filtro = 'WHERE r.estado = $1';
  }

  const result = await db.query(
    `SELECT r.id, r.inmueble_id, r.motivo, r.descripcion, r.estado, r.created_at, r.resuelto_en,
            i.titulo AS inmueble_titulo, i.moderacion AS inmueble_moderacion, i.estado AS inmueble_estado,
            rep.nombre AS reportante_nombre, rep.email AS reportante_email,
            adm.nombre AS resuelto_por_nombre
     FROM reportes r
     JOIN inmuebles i ON i.id = r.inmueble_id
     LEFT JOIN usuarios rep ON rep.id = r.reportante_id
     LEFT JOIN usuarios adm ON adm.id = r.resuelto_por
     ${filtro}
     ORDER BY r.created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ status: 'success', total: result.rowCount, data: result.rows });
}

/**
 * GET /api/admin/inmuebles?moderacion=&q=
 */
async function listarInmuebles(req, res) {
  const { moderacion, q } = req.query;
  const params = [];
  const condiciones = [];

  if (moderacion && moderacion !== 'todas') {
    if (!MODERACIONES.includes(moderacion)) throw errorHttp(400, 'Filtro de moderación no válido.');
    params.push(moderacion);
    condiciones.push(`i.moderacion = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(patron(String(q).trim()));
    condiciones.push(`(i.titulo ILIKE $${params.length} OR i.barrio ILIKE $${params.length} OR u.nombre ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  const result = await db.query(
    `SELECT i.id, i.titulo, i.barrio, i.precio, i.estado, i.moderacion, i.imagen_principal, i.revisado_en,
            i.created_at, u.nombre AS propietario_nombre, u.email AS propietario_email,
            (SELECT count(*)::int FROM reportes r WHERE r.inmueble_id = i.id AND r.estado = 'pendiente') AS reportes_pendientes
     FROM inmuebles i
     LEFT JOIN usuarios u ON u.id = i.propietario_id
     ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
     ORDER BY reportes_pendientes DESC, i.created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ status: 'success', total: result.rowCount, data: result.rows });
}

/**
 * GET /api/admin/inmuebles/:id  — inmueble completo, propietario, reportes e historial
 */
async function detalleInmueble(req, res) {
  const id = idEntero(req.params.id);

  const inmueble = await db.query(
    `SELECT i.*, u.nombre AS propietario_nombre, u.email AS propietario_email, u.telefono AS propietario_telefono,
            u.estado AS propietario_estado, (a.email_confirmed_at IS NOT NULL) AS propietario_correo_confirmado,
            rev.nombre AS revisado_por_nombre
     FROM inmuebles i
     LEFT JOIN usuarios u ON u.id = i.propietario_id
     LEFT JOIN auth.users a ON a.id = i.propietario_id
     LEFT JOIN usuarios rev ON rev.id = i.revisado_por
     WHERE i.id = $1`,
    [id]
  );
  if (inmueble.rows.length === 0) throw errorHttp(404, `No existe el inmueble ${id}.`);

  const [reportes, historial] = await Promise.all([
    db.query(
      `SELECT r.id, r.motivo, r.descripcion, r.estado, r.created_at, r.resuelto_en,
              rep.nombre AS reportante_nombre, rep.email AS reportante_email
       FROM reportes r LEFT JOIN usuarios rep ON rep.id = r.reportante_id
       WHERE r.inmueble_id = $1 ORDER BY r.created_at DESC`,
      [id]
    ),
    db.query(
      `SELECT h.id, h.accion, h.moderacion_anterior, h.moderacion_nueva, h.justificacion, h.created_at,
              adm.nombre AS admin_nombre
       FROM moderacion_historial h LEFT JOIN usuarios adm ON adm.id = h.admin_id
       WHERE h.inmueble_id = $1 ORDER BY h.created_at DESC`,
      [id]
    )
  ]);

  res.json({ status: 'success', data: { inmueble: inmueble.rows[0], reportes: reportes.rows, historial: historial.rows } });
}

/**
 * POST /api/admin/inmuebles/:id/moderacion
 * { decision: aprobar|solicitar_cambios|rechazar|retirar, justificacion, mensajePropietario?, alcance? }
 *  - justificacion: interna, queda en el historial de auditoría (obligatoria).
 *  - mensajePropietario: lo ve solo el propietario; nunca incluye datos del reportante.
 *  - alcance (solo aprobar): qué se comprobó; respalda la insignia "Revisada por Roumix".
 * El estado comercial (disponible/pausado/arrendado) NO se toca.
 */
async function moderarInmueble(req, res) {
  const id = idEntero(req.params.id);
  const body = req.body || {};
  const config = DECISIONES[body.decision];
  if (!config) throw errorHttp(400, `decision debe ser una de: ${Object.keys(DECISIONES).join(', ')}.`);

  const justificacion = texto(body.justificacion, 'La justificación', 10, 1000);
  const mensaje = typeof body.mensajePropietario === 'string' && body.mensajePropietario.trim()
    ? texto(body.mensajePropietario, 'El mensaje al propietario', 1, 1000)
    : config.mensaje;
  const alcance = body.decision === 'aprobar'
    ? texto(body.alcance || 'Coherencia entre fotos, descripción, precio y ubicación.', 'El alcance de la revisión', 10, 300)
    : null;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, titulo, moderacion, propietario_id FROM inmuebles WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (rows.length === 0) throw errorHttp(404, `No existe el inmueble ${id}.`);
    const inmueble = rows[0];
    if (inmueble.propietario_id === req.usuario.id) throw errorHttp(403, 'No puedes moderar tu propia publicación.');

    if (body.decision === 'aprobar') {
      await client.query(
        `UPDATE inmuebles SET moderacion = 'aprobada', moderacion_mensaje = $2,
           revisado_en = now(), revisado_por = $3, revision_alcance = $4
         WHERE id = $1`,
        [id, mensaje, req.usuario.id, alcance]
      );
    } else {
      // Una decisión negativa invalida la insignia de revisión anterior
      await client.query(
        `UPDATE inmuebles SET moderacion = $2, moderacion_mensaje = $3,
           revisado_en = NULL, revisado_por = NULL, revision_alcance = NULL
         WHERE id = $1`,
        [id, config.moderacion, mensaje]
      );
    }

    const { rowCount: reportesResueltos } = await client.query(
      `UPDATE reportes SET estado = $2, resuelto_en = now(), resuelto_por = $3
       WHERE inmueble_id = $1 AND estado = 'pendiente'`,
      [id, config.reportes, req.usuario.id]
    );

    await client.query(
      `INSERT INTO moderacion_historial
         (inmueble_id, inmueble_titulo, usuario_afectado_id, admin_id, accion, moderacion_anterior, moderacion_nueva, justificacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, inmueble.titulo, inmueble.propietario_id, req.usuario.id, body.decision,
        inmueble.moderacion, config.moderacion, justificacion]
    );

    await client.query('COMMIT');
    res.json({
      status: 'success',
      message: `Decisión registrada: ${body.decision}. Reportes resueltos: ${reportesResueltos}.`,
      data: { id, moderacion: config.moderacion }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * GET /api/admin/usuarios?rol=&estado=&q=
 */
async function listarUsuarios(req, res) {
  const { rol, estado, q } = req.query;
  const params = [];
  const condiciones = [];

  if (rol && rol !== 'todos') {
    if (!['estudiante', 'propietario', 'admin'].includes(rol)) throw errorHttp(400, 'Filtro de rol no válido.');
    params.push(rol);
    condiciones.push(`u.rol = $${params.length}`);
  }
  if (estado && estado !== 'todos') {
    if (!['activo', 'suspendido'].includes(estado)) throw errorHttp(400, 'Filtro de estado no válido.');
    params.push(estado);
    condiciones.push(`u.estado = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(patron(String(q).trim()));
    condiciones.push(`(u.nombre ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  const result = await db.query(
    `SELECT u.id, u.nombre, u.email, u.rol, u.estado, u.telefono, u.created_at, u.acepto_politica_en,
            (a.email_confirmed_at IS NOT NULL) AS correo_confirmado,
            (SELECT count(*)::int FROM inmuebles i WHERE i.propietario_id = u.id) AS inmuebles,
            (SELECT count(*)::int FROM reportes r JOIN inmuebles i ON i.id = r.inmueble_id
              WHERE i.propietario_id = u.id AND r.estado = 'procedente') AS reportes_procedentes
     FROM usuarios u
     LEFT JOIN auth.users a ON a.id = u.id
     ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
     ORDER BY u.created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ status: 'success', total: result.rowCount, data: result.rows });
}

/**
 * POST /api/admin/usuarios/:id/estado  { estado: activo|suspendido, justificacion }
 * No se puede aplicar a uno mismo ni a otros administradores
 * (los roles de administrador solo se gestionan con scripts/asignar-admin.js).
 */
async function cambiarEstadoUsuario(req, res) {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw errorHttp(400, 'id de usuario no válido.');
  const { estado } = req.body || {};
  if (!['activo', 'suspendido'].includes(estado)) throw errorHttp(400, 'estado debe ser activo o suspendido.');
  const justificacion = texto((req.body || {}).justificacion, 'La justificación', 10, 1000);

  if (id === req.usuario.id) throw errorHttp(403, 'No puedes cambiar el estado de tu propia cuenta.');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, rol, estado FROM usuarios WHERE id = $1 FOR UPDATE', [id]);
    if (rows.length === 0) throw errorHttp(404, 'No existe ese usuario.');
    if (rows[0].rol === 'admin') throw errorHttp(403, 'Las cuentas de administrador no se gestionan desde el panel.');
    if (rows[0].estado === estado) throw errorHttp(409, `La cuenta ya está ${estado}.`);

    await client.query('UPDATE usuarios SET estado = $2 WHERE id = $1', [id, estado]);
    await client.query(
      `INSERT INTO moderacion_historial (usuario_afectado_id, admin_id, accion, justificacion)
       VALUES ($1, $2, $3, $4)`,
      [id, req.usuario.id, estado === 'suspendido' ? 'cuenta_suspendida' : 'cuenta_reactivada', justificacion]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  res.json({ status: 'success', message: estado === 'suspendido' ? 'Cuenta suspendida.' : 'Cuenta reactivada.' });
}

/**
 * GET /api/admin/historial?limite=
 */
async function historial(req, res) {
  const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 500);
  const result = await db.query(
    `SELECT h.id, h.accion, h.inmueble_id, h.inmueble_titulo, h.moderacion_anterior, h.moderacion_nueva,
            h.justificacion, h.created_at,
            adm.nombre AS admin_nombre, afe.nombre AS afectado_nombre, afe.email AS afectado_email
     FROM moderacion_historial h
     LEFT JOIN usuarios adm ON adm.id = h.admin_id
     LEFT JOIN usuarios afe ON afe.id = h.usuario_afectado_id
     ORDER BY h.created_at DESC
     LIMIT $1`,
    [limite]
  );
  res.json({ status: 'success', total: result.rowCount, data: result.rows });
}

module.exports = {
  resumen,
  listarReportes,
  listarInmuebles,
  detalleInmueble,
  moderarInmueble,
  listarUsuarios,
  cambiarEstadoUsuario,
  historial
};
