/**
 * Comunicación gestionada: cada usuario conversa SOLO con el equipo de Roumix.
 * No existe forma de que un estudiante y un propietario se escriban entre sí.
 *
 * - Usuario (estudiante o propietario): sus conversaciones, sin notas internas.
 * - Administración: todas las conversaciones, notas internas y estado
 *   (pendiente = espera respuesta de Roumix, atendida = respondida).
 */
const db = require('../config/db');
const notificaciones = require('../services/notificacionesService');
const { crearAviso } = require('../services/avisosService');
const { CONDICION_PUBLICA } = require('./inmueblesController');

const MAX_NUEVAS_POR_DIA = 5;
const MAX_MENSAJES_POR_HORA = 30;

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function idEntero(valor, campo = 'id') {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorHttp(400, `${campo} no válido.`);
  return id;
}

function idOpcional(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  return idEntero(valor, campo);
}

function texto(valor, campo, min, max) {
  const limpio = typeof valor === 'string' ? valor.trim() : '';
  if (limpio.length < min) throw errorHttp(400, min <= 1 ? `${campo} no puede estar vacío.` : `${campo} debe tener al menos ${min} caracteres.`);
  if (limpio.length > max) throw errorHttp(400, `${campo} admite máximo ${max} caracteres.`);
  return limpio;
}

// Columnas de la lista: incluye si hay algo sin leer para quien consulta
const COLUMNAS_LISTA = (lado) => `
  c.id, c.asunto, c.estado, c.inmueble_id, c.solicitud_id, c.ultimo_mensaje_en, c.created_at, c.iniciada_por,
  i.titulo AS inmueble_titulo,
  (SELECT m.cuerpo FROM mensajes m WHERE m.conversacion_id = c.id AND m.tipo = 'mensaje' ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS ultimo_mensaje,
  EXISTS (SELECT 1 FROM mensajes m WHERE m.conversacion_id = c.id AND m.tipo = 'mensaje'
          AND m.autor_rol ${lado === 'usuario' ? "= 'admin'" : "<> 'admin'"}
          AND m.created_at > COALESCE(c.${lado === 'usuario' ? 'leida_usuario_en' : 'leida_admin_en'}, 'epoch')) AS sin_leer`;

/**
 * Comprueba a qué puede referirse una conversación nueva del usuario:
 * - estudiante: cualquier vivienda visible, o una solicitud suya;
 * - propietario: una vivienda suya, o una solicitud que Roumix le compartió.
 */
async function validarReferencias(usuario, inmuebleId, solicitudId) {
  let inmueble = inmuebleId;
  if (solicitudId) {
    const condicion = usuario.rol === 'estudiante'
      ? 'estudiante_id = $2'
      : 'propietario_id = $2 AND compartida_propietario_en IS NOT NULL';
    const { rows } = await db.query(`SELECT id, inmueble_id FROM solicitudes WHERE id = $1 AND ${condicion}`, [solicitudId, usuario.id]);
    if (rows.length === 0) throw errorHttp(404, 'No tienes una solicitud con ese número.');
    inmueble = rows[0].inmueble_id;
  } else if (inmuebleId) {
    const consulta = usuario.rol === 'estudiante'
      ? `SELECT i.id FROM inmuebles i LEFT JOIN usuarios u ON u.id = i.propietario_id WHERE i.id = $1 AND ${CONDICION_PUBLICA}`
      : 'SELECT id FROM inmuebles WHERE id = $1 AND propietario_id = $2';
    const { rows } = await db.query(consulta, usuario.rol === 'estudiante' ? [inmuebleId] : [inmuebleId, usuario.id]);
    if (rows.length === 0) throw errorHttp(404, 'Esa vivienda no está disponible.');
  }
  return inmueble;
}

async function limitarMensajes(usuarioId) {
  const { rows: [r] } = await db.query(
    `SELECT count(*)::int AS n FROM mensajes WHERE autor_id = $1 AND created_at > now() - interval '1 hour'`,
    [usuarioId]
  );
  if (r.n >= MAX_MENSAJES_POR_HORA) throw errorHttp(429, 'Enviaste muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.');
}

// ============================================================================
// Usuario (estudiante o propietario)
// ============================================================================

/** GET /api/conversaciones */
async function misConversaciones(req, res) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_LISTA('usuario')}
     FROM conversaciones c LEFT JOIN inmuebles i ON i.id = c.inmueble_id
     WHERE c.usuario_id = $1
     ORDER BY c.ultimo_mensaje_en DESC
     LIMIT 100`,
    [req.usuario.id]
  );
  res.json({ status: 'success', data: rows });
}

/** POST /api/conversaciones  { asunto, mensaje, inmuebleId?, solicitudId? } */
async function crearConversacion(req, res) {
  const body = req.body || {};
  const asunto = texto(body.asunto, 'El asunto', 3, 150);
  const mensaje = texto(body.mensaje, 'El mensaje', 2, 2000);
  const solicitudId = idOpcional(body.solicitudId, 'La solicitud');
  const inmuebleId = await validarReferencias(req.usuario, idOpcional(body.inmuebleId, 'La vivienda'), solicitudId);

  const { rows: [conteo] } = await db.query(
    `SELECT count(*)::int AS n FROM conversaciones WHERE usuario_id = $1 AND iniciada_por = 'usuario' AND created_at > now() - interval '1 day'`,
    [req.usuario.id]
  );
  if (conteo.n >= MAX_NUEVAS_POR_DIA) throw errorHttp(429, 'Ya abriste varias conversaciones hoy. Escribe en una de las que tienes abiertas.');
  await limitarMensajes(req.usuario.id);

  // Si ya hay un hilo de esa solicitud, el mensaje va allí (no se duplican hilos)
  if (solicitudId) {
    const existente = await db.query('SELECT id FROM conversaciones WHERE usuario_id = $1 AND solicitud_id = $2', [req.usuario.id, solicitudId]);
    if (existente.rows.length) {
      req.params = { id: existente.rows[0].id };
      req.body = { mensaje };
      return enviarMensaje(req, res);
    }
  }

  const cliente = await db.pool.connect();
  let id;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO conversaciones (usuario_id, usuario_rol, inmueble_id, solicitud_id, asunto, leida_usuario_en)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
      [req.usuario.id, req.usuario.rol, inmuebleId, solicitudId, asunto]
    );
    id = rows[0].id;
    await cliente.query(
      'INSERT INTO mensajes (conversacion_id, autor_id, autor_rol, cuerpo) VALUES ($1, $2, $3, $4)',
      [id, req.usuario.id, req.usuario.rol, mensaje]
    );
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  await notificaciones.notificarMensajeAdministracion({
    conversacion: { id, asunto }, usuario: req.usuario, mensaje, nueva: true, urlBase: notificaciones.urlBase(req)
  });
  res.status(201).json({ status: 'success', message: 'Mensaje enviado. El equipo de Roumix te responderá pronto.', data: { id } });
}

/** GET /api/conversaciones/:id  — los mensajes (sin notas internas); la marca como leída */
async function verConversacion(req, res) {
  const id = idEntero(req.params.id);
  const { rows } = await db.query(
    `UPDATE conversaciones c SET leida_usuario_en = now()
     FROM conversaciones c2 LEFT JOIN inmuebles i ON i.id = c2.inmueble_id
     WHERE c.id = $1 AND c.usuario_id = $2 AND c2.id = c.id
     RETURNING c.id, c.asunto, c.estado, c.inmueble_id, c.solicitud_id, c.created_at, i.titulo AS inmueble_titulo`,
    [id, req.usuario.id]
  );
  if (rows.length === 0) throw errorHttp(404, 'No tienes una conversación con ese número.');
  const mensajes = await db.query(
    `SELECT id, autor_rol, cuerpo, created_at FROM mensajes
     WHERE conversacion_id = $1 AND tipo = 'mensaje' ORDER BY created_at, id`,
    [id]
  );
  // Los avisos de esta conversación quedan leídos
  await db.query(
    "UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL AND tipo = 'mensaje' AND enlace = $2",
    [req.usuario.id, `mensajes.html?c=${id}`]
  );
  res.json({ status: 'success', data: { ...rows[0], mensajes: mensajes.rows } });
}

/** POST /api/conversaciones/:id/mensajes  { mensaje } */
async function enviarMensaje(req, res) {
  const id = idEntero(req.params.id);
  const mensaje = texto((req.body || {}).mensaje, 'El mensaje', 1, 2000);
  await limitarMensajes(req.usuario.id);

  const cliente = await db.pool.connect();
  let conversacion;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      'SELECT id, asunto, estado FROM conversaciones WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
      [id, req.usuario.id]
    );
    if (rows.length === 0) throw errorHttp(404, 'No tienes una conversación con ese número.');
    conversacion = rows[0];
    await cliente.query(
      'INSERT INTO mensajes (conversacion_id, autor_id, autor_rol, cuerpo) VALUES ($1, $2, $3, $4)',
      [id, req.usuario.id, req.usuario.rol, mensaje]
    );
    await cliente.query(
      "UPDATE conversaciones SET estado = 'pendiente', ultimo_mensaje_en = now(), leida_usuario_en = now() WHERE id = $1",
      [id]
    );
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  // Solo se avisa por correo cuando el hilo pasa de atendido a pendiente (no en cada mensaje)
  if (conversacion.estado === 'atendida') {
    await notificaciones.notificarMensajeAdministracion({
      conversacion, usuario: req.usuario, mensaje, nueva: false, urlBase: notificaciones.urlBase(req)
    });
  }
  res.status(201).json({ status: 'success', message: 'Mensaje enviado.', data: { id } });
}

/** GET /api/notificaciones */
async function misAvisos(req, res) {
  const { rows } = await db.query(
    `SELECT id, tipo, titulo, cuerpo, enlace, leida_en, created_at FROM notificaciones
     WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [req.usuario.id]
  );
  const { rows: [conteo] } = await db.query(
    'SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND leida_en IS NULL',
    [req.usuario.id]
  );
  res.json({ status: 'success', noLeidas: conteo.n, data: rows });
}

/** POST /api/notificaciones/leidas  { ids?: number[] }  (sin ids: todas) */
async function marcarAvisosLeidos(req, res) {
  const ids = (req.body || {}).ids;
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some((n) => !Number.isInteger(n) || n < 1))) {
    throw errorHttp(400, 'ids no válidos.');
  }
  const { rowCount } = ids
    ? await db.query('UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL AND id = ANY($2)', [req.usuario.id, ids])
    : await db.query('UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL', [req.usuario.id]);
  res.json({ status: 'success', data: { marcadas: rowCount } });
}

// ============================================================================
// Administración
// ============================================================================

/** GET /api/admin/conversaciones?estado=pendiente|atendida|todas&rol=estudiante|propietario&q= */
async function listarAdmin(req, res) {
  const params = [];
  const condiciones = [];
  const estado = String(req.query.estado || 'pendiente');
  if (estado !== 'todas') {
    if (!['pendiente', 'atendida'].includes(estado)) throw errorHttp(400, 'Filtro de estado no válido.');
    params.push(estado);
    condiciones.push(`c.estado = $${params.length}`);
  }
  const rol = req.query.rol ? String(req.query.rol) : '';
  if (rol) {
    if (!['estudiante', 'propietario'].includes(rol)) throw errorHttp(400, 'Filtro de rol no válido.');
    params.push(rol);
    condiciones.push(`c.usuario_rol = $${params.length}`);
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    const n = params.length;
    condiciones.push(`(c.asunto ILIKE $${n} OR u.nombre ILIKE $${n} OR u.email ILIKE $${n} OR i.titulo ILIKE $${n})`);
  }

  const { rows } = await db.query(
    `SELECT ${COLUMNAS_LISTA('admin')}, c.usuario_id, c.usuario_rol, u.nombre AS usuario_nombre, u.email AS usuario_email
     FROM conversaciones c
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     LEFT JOIN inmuebles i ON i.id = c.inmueble_id
     ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
     ORDER BY (c.estado = 'pendiente') DESC, c.ultimo_mensaje_en DESC
     LIMIT 200`,
    params
  );
  res.json({ status: 'success', data: rows });
}

/** GET /api/admin/conversaciones/:id — con notas internas y el contexto */
async function detalleAdmin(req, res) {
  const id = idEntero(req.params.id);
  const { rows } = await db.query(
    `UPDATE conversaciones c SET leida_admin_en = now()
     FROM conversaciones c2
     LEFT JOIN usuarios u ON u.id = c2.usuario_id
     LEFT JOIN inmuebles i ON i.id = c2.inmueble_id
     LEFT JOIN solicitudes s ON s.id = c2.solicitud_id
     WHERE c.id = $1 AND c2.id = c.id
     RETURNING c.*, u.nombre AS usuario_nombre, u.email AS usuario_email, u.telefono AS usuario_telefono,
               i.titulo AS inmueble_titulo, s.estado AS solicitud_estado`,
    [id]
  );
  if (rows.length === 0) throw errorHttp(404, `No existe la conversación ${id}.`);
  const mensajes = await db.query(
    `SELECT m.id, m.autor_rol, m.tipo, m.cuerpo, m.created_at, a.nombre AS autor_nombre
     FROM mensajes m LEFT JOIN usuarios a ON a.id = m.autor_id
     WHERE m.conversacion_id = $1 ORDER BY m.created_at, m.id`,
    [id]
  );
  res.json({ status: 'success', data: { ...rows[0], mensajes: mensajes.rows } });
}

/**
 * Inserta un mensaje del equipo de Roumix (o una nota interna) y avisa al usuario.
 */
async function responderComoAdmin({ conversacionId, admin, cuerpo, interna, urlBase }) {
  const cliente = await db.pool.connect();
  let conversacion;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT id, asunto, usuario_id FROM conversaciones WHERE id = $1 FOR UPDATE', [conversacionId]);
    if (rows.length === 0) throw errorHttp(404, `No existe la conversación ${conversacionId}.`);
    conversacion = rows[0];
    await cliente.query(
      'INSERT INTO mensajes (conversacion_id, autor_id, autor_rol, tipo, cuerpo) VALUES ($1, $2, $3, $4, $5)',
      [conversacionId, admin.id, 'admin', interna ? 'nota_interna' : 'mensaje', cuerpo]
    );
    if (interna) {
      await cliente.query('UPDATE conversaciones SET leida_admin_en = now() WHERE id = $1', [conversacionId]);
    } else {
      await cliente.query(
        "UPDATE conversaciones SET estado = 'atendida', ultimo_mensaje_en = now(), leida_admin_en = now() WHERE id = $1",
        [conversacionId]
      );
      await crearAviso({
        usuarioId: conversacion.usuario_id, tipo: 'mensaje',
        titulo: `Roumix respondió: ${conversacion.asunto}`, cuerpo, enlace: `mensajes.html?c=${conversacionId}`
      }, cliente);
    }
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  if (!interna) {
    await notificaciones.notificarRespuestaRoumix({ usuarioId: conversacion.usuario_id, conversacion, mensaje: cuerpo, urlBase });
  }
}

/** POST /api/admin/conversaciones/:id/mensajes  { mensaje, interna? } */
async function responderAdmin(req, res) {
  const id = idEntero(req.params.id);
  const body = req.body || {};
  const interna = body.interna === true;
  const cuerpo = texto(body.mensaje, interna ? 'La nota interna' : 'El mensaje', 1, 2000);
  await responderComoAdmin({ conversacionId: id, admin: req.usuario, cuerpo, interna, urlBase: notificaciones.urlBase(req) });
  res.status(201).json({ status: 'success', message: interna ? 'Nota interna guardada.' : 'Respuesta enviada al usuario.' });
}

/** POST /api/admin/conversaciones/:id/estado  { estado: pendiente | atendida } */
async function cambiarEstadoAdmin(req, res) {
  const id = idEntero(req.params.id);
  const estado = (req.body || {}).estado;
  if (!['pendiente', 'atendida'].includes(estado)) throw errorHttp(400, 'estado debe ser "pendiente" o "atendida".');
  const { rowCount } = await db.query('UPDATE conversaciones SET estado = $2 WHERE id = $1', [id, estado]);
  if (rowCount === 0) throw errorHttp(404, `No existe la conversación ${id}.`);
  res.json({ status: 'success', message: estado === 'atendida' ? 'Conversación marcada como atendida.' : 'Conversación marcada como pendiente.' });
}

/**
 * POST /api/admin/conversaciones  { solicitudId, para: 'estudiante' | 'propietario', mensaje }
 * Roumix le escribe a una de las partes de una solicitud. Reutiliza el hilo si ya existe.
 */
async function iniciarAdmin(req, res) {
  const body = req.body || {};
  const solicitudId = idEntero(body.solicitudId, 'La solicitud');
  if (!['estudiante', 'propietario'].includes(body.para)) throw errorHttp(400, 'para debe ser "estudiante" o "propietario".');
  const cuerpo = texto(body.mensaje, 'El mensaje', 2, 2000);

  const { rows } = await db.query(
    'SELECT id, inmueble_id, inmueble_titulo, estudiante_id, propietario_id, compartida_propietario_en FROM solicitudes WHERE id = $1',
    [solicitudId]
  );
  if (rows.length === 0) throw errorHttp(404, `No existe la solicitud ${solicitudId}.`);
  const solicitud = rows[0];
  const usuarioId = body.para === 'estudiante' ? solicitud.estudiante_id : solicitud.propietario_id;
  if (!usuarioId) throw errorHttp(409, 'Esa cuenta ya no existe.');
  if (body.para === 'propietario' && !solicitud.compartida_propietario_en) {
    throw errorHttp(409, 'El propietario aún no conoce esta solicitud: pásala a "En revisión" para compartírsela.');
  }

  const { rows: [conversacion] } = await db.query(
    `INSERT INTO conversaciones (usuario_id, usuario_rol, inmueble_id, solicitud_id, asunto, estado, iniciada_por, leida_admin_en)
     VALUES ($1, $2, $3, $4, $5, 'atendida', 'admin', now())
     ON CONFLICT (usuario_id, solicitud_id) WHERE solicitud_id IS NOT NULL DO UPDATE SET updated_at = now()
     RETURNING id`,
    [usuarioId, body.para, solicitud.inmueble_id, solicitud.id, `Solicitud #${solicitud.id}: ${solicitud.inmueble_titulo}`.slice(0, 150)]
  );
  await responderComoAdmin({ conversacionId: conversacion.id, admin: req.usuario, cuerpo, interna: false, urlBase: notificaciones.urlBase(req) });
  res.status(201).json({ status: 'success', message: `Mensaje enviado al ${body.para}.`, data: { id: conversacion.id } });
}

module.exports = {
  misConversaciones,
  crearConversacion,
  verConversacion,
  enviarMensaje,
  misAvisos,
  marcarAvisosLeidos,
  listarAdmin,
  detalleAdmin,
  responderAdmin,
  cambiarEstadoAdmin,
  iniciarAdmin
};
