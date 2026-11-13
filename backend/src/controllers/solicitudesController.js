/**
 * Solicitudes de arriendo (comunicación gestionada por Roumix).
 *
 * - El estudiante envía la solicitud y puede cancelarla mientras siga abierta.
 * - El equipo de Roumix la revisa, habla con el propietario y cambia su estado.
 * - El propietario solo la ve cuando Roumix la comparte, sin datos de contacto
 *   del estudiante; y el estudiante nunca ve los datos de contacto del propietario.
 * - Los estados de contrato y pago los pondrá el sistema (módulos 5 y 6), nunca a mano.
 */
const db = require('../config/db');
const notificaciones = require('../services/notificacionesService');
const { crearAviso } = require('../services/avisosService');
const { cancelarVigenteDeSolicitud } = require('./contratosController');
const { CONDICION_PUBLICA } = require('./inmueblesController');

const ESTADOS = {
  recibida: 'Recibida',
  en_revision: 'En revisión',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  visita_coordinada: 'Visita coordinada',
  en_negociacion: 'En negociación',
  contrato_pendiente: 'Contrato pendiente',
  contrato_formalizado: 'Contrato formalizado',
  pago_pendiente: 'Pago pendiente',
  pagado: 'Pagado',
  completada: 'Completada',
  cancelada: 'Cancelada'
};
const CERRADOS = ['rechazada', 'completada', 'cancelada'];

// Cambios que el equipo de Roumix puede hacer a mano
const TRANSICIONES_ADMIN = {
  recibida: ['en_revision', 'rechazada', 'cancelada'],
  en_revision: ['aceptada', 'rechazada', 'cancelada'],
  aceptada: ['visita_coordinada', 'en_negociacion', 'cancelada'],
  visita_coordinada: ['en_negociacion', 'rechazada', 'cancelada'],
  en_negociacion: ['contrato_pendiente', 'rechazada', 'cancelada'],
  contrato_pendiente: ['en_negociacion', 'cancelada']
};
// Estados que solo pondrá el sistema cuando existan el contrato y el pago confirmado
const SOLO_SISTEMA = {
  contrato_formalizado: 'se pondrá automáticamente cuando el contrato quede formalizado',
  pago_pendiente: 'se pondrá automáticamente cuando el contrato quede formalizado',
  pagado: 'solo se pone cuando el proveedor de pagos confirma el pago',
  completada: 'se habilitará cuando el pago esté confirmado'
};
// El estudiante puede cancelar mientras no haya contrato formalizado
const CANCELABLES_ESTUDIANTE = Object.keys(TRANSICIONES_ADMIN);

const MAX_ABIERTAS = 5;
const MAX_POR_DIA = 10;

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

function entero(valor, campo, min, max) {
  const n = Number(valor);
  if (valor === undefined || valor === null || valor === '' || !Number.isInteger(n) || n < min || n > max) {
    throw errorHttp(400, `${campo} debe ser un número entero entre ${min} y ${max}.`);
  }
  return n;
}

function textoOpcional(valor, campo, max, min = 0) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw errorHttp(400, `${campo} debe ser texto.`);
  const limpio = valor.trim();
  if (!limpio) return null;
  if (limpio.length < min) throw errorHttp(400, `${campo} debe tener al menos ${min} caracteres.`);
  if (limpio.length > max) throw errorHttp(400, `${campo} admite máximo ${max} caracteres.`);
  return limpio;
}

// Hoy en Colombia (UTC-5) como AAAA-MM-DD
function hoyBogota(desplazamientoDias = 0) {
  const fecha = new Date(Date.now() - 5 * 3600 * 1000 + desplazamientoDias * 86400 * 1000);
  return fecha.toISOString().slice(0, 10);
}

function fechaIngreso(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) {
    throw errorHttp(400, 'Indica la fecha en la que te gustaría mudarte.');
  }
  if (new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) !== valor) throw errorHttp(400, 'La fecha de ingreso no es válida.');
  if (valor < hoyBogota()) throw errorHttp(400, 'La fecha de ingreso no puede estar en el pasado.');
  if (valor > hoyBogota(365)) throw errorHttp(400, 'La fecha de ingreso debe estar dentro del próximo año.');
  return valor;
}

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || 'Estudiante';

// Historial que ve cada parte: solo sus notas y los cambios de estado
const HISTORIAL = {
  estudiante: `COALESCE((SELECT json_agg(json_build_object('estado', h.estado_nuevo, 'nota', h.nota_estudiante, 'fecha', h.created_at) ORDER BY h.created_at)
      FROM solicitudes_historial h WHERE h.solicitud_id = s.id AND (h.estado_nuevo IS NOT NULL OR h.nota_estudiante IS NOT NULL)), '[]')`,
  propietario: `COALESCE((SELECT json_agg(json_build_object('estado', h.estado_nuevo, 'nota', h.nota_propietario, 'fecha', h.created_at) ORDER BY h.created_at)
      FROM solicitudes_historial h WHERE h.solicitud_id = s.id AND h.created_at >= s.compartida_propietario_en
        AND (h.estado_nuevo IS NOT NULL OR h.nota_propietario IS NOT NULL)), '[]')`
};

async function registrarHistorial(cliente, { solicitudId, anterior, nuevo, autor, rol, notaEstudiante = null, notaPropietario = null, notaInterna = null }) {
  await cliente.query(
    `INSERT INTO solicitudes_historial
       (solicitud_id, estado_anterior, estado_nuevo, autor_id, autor_rol, nota_estudiante, nota_propietario, nota_interna)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [solicitudId, anterior, nuevo, autor, rol, notaEstudiante, notaPropietario, notaInterna]
  );
}

/**
 * POST /api/solicitudes  (estudiante)
 * { inmuebleId, fechaIngreso, duracionMeses, personas, mensaje }
 */
async function crearSolicitud(req, res) {
  const body = req.body || {};
  const inmuebleId = idEntero(body.inmuebleId);
  const fecha = fechaIngreso(body.fechaIngreso);
  const duracion = entero(body.duracionMeses, 'La duración (meses)', 1, 24);
  const personas = entero(body.personas === undefined ? 1 : body.personas, 'El número de personas', 1, 20);
  const mensaje = textoOpcional(body.mensaje, 'El mensaje', 1000);

  const { rows } = await db.query(
    `SELECT i.id, i.titulo, i.precio, i.capacidad, i.propietario_id
     FROM inmuebles i LEFT JOIN usuarios u ON u.id = i.propietario_id
     WHERE i.id = $1 AND ${CONDICION_PUBLICA}`,
    [inmuebleId]
  );
  if (rows.length === 0) throw errorHttp(404, 'Esta publicación ya no está disponible.');
  const inmueble = rows[0];
  if (!inmueble.propietario_id) throw errorHttp(409, 'Esta publicación es de demostración y no recibe solicitudes.');
  if (inmueble.capacidad && personas > inmueble.capacidad) {
    throw errorHttp(400, `Este inmueble es para máximo ${inmueble.capacidad} persona${inmueble.capacidad === 1 ? '' : 's'}.`);
  }

  const { rows: [conteo] } = await db.query(
    `SELECT count(*) FILTER (WHERE estado NOT IN ('rechazada', 'completada', 'cancelada'))::int AS abiertas,
            count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS hoy
     FROM solicitudes WHERE estudiante_id = $1`,
    [req.usuario.id]
  );
  if (conteo.hoy >= MAX_POR_DIA) throw errorHttp(429, 'Enviaste muchas solicitudes hoy. Intenta de nuevo mañana.');
  if (conteo.abiertas >= MAX_ABIERTAS) {
    throw errorHttp(409, `Ya tienes ${MAX_ABIERTAS} solicitudes abiertas. Cancela alguna o espera la respuesta de Roumix antes de enviar otra.`);
  }

  const cliente = await db.pool.connect();
  let solicitud;
  try {
    await cliente.query('BEGIN');
    const insertada = await cliente.query(
      `INSERT INTO solicitudes (inmueble_id, estudiante_id, propietario_id, inmueble_titulo, canon_mensual,
                                fecha_ingreso, duracion_meses, personas, mensaje)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, estado, created_at`,
      [inmueble.id, req.usuario.id, inmueble.propietario_id, inmueble.titulo, inmueble.precio, fecha, duracion, personas, mensaje]
    );
    solicitud = insertada.rows[0];
    await registrarHistorial(cliente, {
      solicitudId: solicitud.id, anterior: null, nuevo: 'recibida', autor: req.usuario.id, rol: 'estudiante',
      notaEstudiante: 'Recibimos tu solicitud. El equipo de Roumix la revisará y hablará con el propietario por ti.'
    });
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    if (error.code === '23505') throw errorHttp(409, 'Ya tienes una solicitud abierta para este inmueble.');
    throw error;
  } finally {
    cliente.release();
  }

  await notificaciones.notificarSolicitudNueva({
    solicitud: { id: solicitud.id, inmuebleTitulo: inmueble.titulo, fechaIngreso: fecha, duracion, personas },
    estudiante: req.usuario,
    urlBase: notificaciones.urlBase(req)
  });

  res.status(201).json({
    status: 'success',
    message: 'Solicitud enviada. Roumix la revisará y te avisará por correo.',
    data: { id: solicitud.id, estado: solicitud.estado, inmueble_id: inmueble.id }
  });
}

/**
 * GET /api/solicitudes/mias
 * Estudiante: sus solicitudes. Propietario: las que Roumix le compartió.
 * Ninguna de las dos vistas incluye datos de contacto de la otra parte.
 */
async function misSolicitudes(req, res) {
  if (req.usuario.rol === 'estudiante') {
    const { rows } = await db.query(
      `SELECT s.id, s.inmueble_id, s.inmueble_titulo, s.canon_mensual, s.estado, s.fecha_ingreso,
              s.duracion_meses, s.personas, s.mensaje, s.created_at, s.updated_at,
              (SELECT json_build_object('id', ct.id, 'estado', ct.estado) FROM contratos ct
                WHERE ct.solicitud_id = s.id AND ct.estado <> 'borrador' ORDER BY ct.created_at DESC LIMIT 1) AS contrato,
              (SELECT json_build_object('id', pg.id, 'estado', pg.estado) FROM pagos pg
                WHERE pg.solicitud_id = s.id ORDER BY pg.created_at DESC LIMIT 1) AS pago,
              i.imagen_principal, i.barrio, ${HISTORIAL.estudiante} AS historial
       FROM solicitudes s JOIN inmuebles i ON i.id = s.inmueble_id
       WHERE s.estudiante_id = $1
       ORDER BY (s.estado IN ('rechazada', 'completada', 'cancelada')), s.updated_at DESC`,
      [req.usuario.id]
    );
    return res.json({ status: 'success', rol: 'estudiante', data: rows });
  }

  const { rows } = await db.query(
    `SELECT s.id, s.inmueble_id, s.inmueble_titulo, s.canon_mensual, s.estado, s.fecha_ingreso,
            s.duracion_meses, s.personas, s.compartida_propietario_en, s.updated_at,
            split_part(COALESCE(e.nombre, 'Estudiante'), ' ', 1) AS estudiante_nombre,
            (SELECT json_build_object('id', ct.id, 'estado', ct.estado) FROM contratos ct
                WHERE ct.solicitud_id = s.id AND ct.estado <> 'borrador' ORDER BY ct.created_at DESC LIMIT 1) AS contrato,
              (SELECT json_build_object('id', pg.id, 'estado', pg.estado) FROM pagos pg
                WHERE pg.solicitud_id = s.id ORDER BY pg.created_at DESC LIMIT 1) AS pago,
              i.imagen_principal, i.barrio, ${HISTORIAL.propietario} AS historial
     FROM solicitudes s
     JOIN inmuebles i ON i.id = s.inmueble_id
     LEFT JOIN usuarios e ON e.id = s.estudiante_id
     WHERE s.propietario_id = $1 AND s.compartida_propietario_en IS NOT NULL
     ORDER BY (s.estado IN ('rechazada', 'completada', 'cancelada')), s.updated_at DESC`,
    [req.usuario.id]
  );
  res.json({ status: 'success', rol: 'propietario', data: rows });
}

/**
 * POST /api/solicitudes/:id/cancelar  (estudiante)  { motivo? }
 */
async function cancelarSolicitud(req, res) {
  const id = idEntero(req.params.id);
  const motivo = textoOpcional((req.body || {}).motivo, 'El motivo', 500);

  const cliente = await db.pool.connect();
  let fila;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      'SELECT id, estado, inmueble_titulo, propietario_id, compartida_propietario_en FROM solicitudes WHERE id = $1 AND estudiante_id = $2 FOR UPDATE',
      [id, req.usuario.id]
    );
    if (rows.length === 0) throw errorHttp(404, 'No tienes una solicitud con ese número.');
    fila = rows[0];
    if (!CANCELABLES_ESTUDIANTE.includes(fila.estado)) {
      throw errorHttp(409, `Esta solicitud está "${ESTADOS[fila.estado]}" y ya no se puede cancelar desde aquí. Escríbele al equipo de Roumix.`);
    }
    await cliente.query("UPDATE solicitudes SET estado = 'cancelada', cerrada_en = now() WHERE id = $1", [id]);
    await cancelarVigenteDeSolicitud(cliente, id, 'El estudiante canceló la solicitud.');
    await registrarHistorial(cliente, {
      solicitudId: id, anterior: fila.estado, nuevo: 'cancelada', autor: req.usuario.id, rol: 'estudiante',
      notaEstudiante: 'Cancelaste la solicitud.',
      notaPropietario: fila.compartida_propietario_en ? 'El estudiante canceló la solicitud.' : null,
      notaInterna: motivo ? `Motivo del estudiante: ${motivo}` : null
    });
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  const urlBase = notificaciones.urlBase(req);
  await notificaciones.notificarSolicitudCanceladaAdmin({ solicitud: { id, inmuebleTitulo: fila.inmueble_titulo }, motivo, urlBase });
  if (fila.compartida_propietario_en) {
    await crearAviso({ usuarioId: fila.propietario_id, tipo: 'solicitud', titulo: `Solicitud #${id}: Cancelada`, cuerpo: 'El estudiante canceló la solicitud.', enlace: 'solicitudes.html' });
    await notificaciones.notificarSolicitudPropietario({
      propietarioId: fila.propietario_id, solicitud: { id, inmuebleTitulo: fila.inmueble_titulo },
      estado: 'cancelada', etiqueta: ESTADOS.cancelada, nota: 'El estudiante canceló la solicitud.', urlBase
    });
  }
  res.json({ status: 'success', message: 'Solicitud cancelada.', data: { id, estado: 'cancelada' } });
}

// ============================================================================
// Administración
// ============================================================================

const FILTROS_ADMIN = {
  abiertas: "s.estado NOT IN ('rechazada', 'completada', 'cancelada')",
  cerradas: "s.estado IN ('rechazada', 'completada', 'cancelada')",
  todas: 'TRUE'
};

/**
 * GET /api/admin/solicitudes?estado=abiertas|cerradas|todas|<estado>&q=
 */
async function listarAdmin(req, res) {
  const estado = String(req.query.estado || 'abiertas');
  const params = [];
  let condicion;
  if (FILTROS_ADMIN[estado]) condicion = FILTROS_ADMIN[estado];
  else if (ESTADOS[estado]) { params.push(estado); condicion = `s.estado = $${params.length}`; }
  else throw errorHttp(400, 'Filtro de estado no válido.');

  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const n = params.length;
    condicion += ` AND (s.inmueble_titulo ILIKE $${n} OR e.nombre ILIKE $${n} OR e.email ILIKE $${n} OR p.nombre ILIKE $${n} OR CAST(s.id AS TEXT) = $${n + 1})`;
    params.push(q.replace(/^#/, ''));
  }

  const { rows } = await db.query(
    `SELECT s.*, e.nombre AS estudiante_nombre, e.email AS estudiante_email,
            p.nombre AS propietario_nombre, p.email AS propietario_email, p.telefono AS propietario_telefono,
            i.barrio, i.estado AS inmueble_estado, i.moderacion AS inmueble_moderacion,
            (SELECT max(h.created_at) FROM solicitudes_historial h WHERE h.solicitud_id = s.id) AS ultima_actividad
     FROM solicitudes s
     JOIN inmuebles i ON i.id = s.inmueble_id
     LEFT JOIN usuarios e ON e.id = s.estudiante_id
     LEFT JOIN usuarios p ON p.id = s.propietario_id
     WHERE ${condicion}
     ORDER BY (s.estado = 'recibida') DESC, s.updated_at DESC
     LIMIT 200`,
    params
  );
  res.json({ status: 'success', data: rows, transiciones: TRANSICIONES_ADMIN, etiquetas: ESTADOS });
}

/**
 * GET /api/admin/solicitudes/:id  — con el historial completo (incluye notas internas)
 */
async function detalleAdmin(req, res) {
  const id = idEntero(req.params.id);
  const { rows } = await db.query(
    `SELECT s.*, e.nombre AS estudiante_nombre, e.email AS estudiante_email, e.telefono AS estudiante_telefono,
            p.nombre AS propietario_nombre, p.email AS propietario_email, p.telefono AS propietario_telefono,
            i.barrio, i.capacidad, i.estado AS inmueble_estado, i.moderacion AS inmueble_moderacion
     FROM solicitudes s
     JOIN inmuebles i ON i.id = s.inmueble_id
     LEFT JOIN usuarios e ON e.id = s.estudiante_id
     LEFT JOIN usuarios p ON p.id = s.propietario_id
     WHERE s.id = $1`,
    [id]
  );
  if (rows.length === 0) throw errorHttp(404, `No existe la solicitud ${id}.`);
  const historial = await db.query(
    `SELECT h.*, u.nombre AS autor_nombre FROM solicitudes_historial h
     LEFT JOIN usuarios u ON u.id = h.autor_id
     WHERE h.solicitud_id = $1 ORDER BY h.created_at`,
    [id]
  );
  res.json({
    status: 'success',
    data: { ...rows[0], historial: historial.rows, siguientes: TRANSICIONES_ADMIN[rows[0].estado] || [] }
  });
}

/**
 * POST /api/admin/solicitudes/:id
 * { estado?, notaEstudiante?, notaPropietario?, notaInterna? }
 * Cambia el estado (si la transición es válida) y/o registra notas para cada parte.
 */
async function actualizarAdmin(req, res) {
  const id = idEntero(req.params.id);
  const body = req.body || {};
  const nuevo = body.estado ? String(body.estado) : null;
  const notaEstudiante = textoOpcional(body.notaEstudiante, 'El mensaje para el estudiante', 1000, 5);
  const notaPropietario = textoOpcional(body.notaPropietario, 'El mensaje para el propietario', 1000, 5);
  const notaInterna = textoOpcional(body.notaInterna, 'La nota interna', 1000, 3);

  if (nuevo && !ESTADOS[nuevo]) throw errorHttp(400, 'Estado no válido.');
  if (nuevo && SOLO_SISTEMA[nuevo]) throw errorHttp(409, `"${ESTADOS[nuevo]}" no se puede poner a mano: ${SOLO_SISTEMA[nuevo]}.`);
  if (!nuevo && !notaEstudiante && !notaPropietario && !notaInterna) {
    throw errorHttp(400, 'Elige un nuevo estado o escribe al menos una nota.');
  }
  if ((nuevo === 'rechazada' || nuevo === 'cancelada') && !notaEstudiante) {
    throw errorHttp(400, 'Explícale al estudiante por qué se cierra la solicitud.');
  }

  const cliente = await db.pool.connect();
  let fila;
  let compartidaAhora = false;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM solicitudes WHERE id = $1 FOR UPDATE', [id]);
    if (rows.length === 0) throw errorHttp(404, `No existe la solicitud ${id}.`);
    fila = rows[0];

    if (nuevo) {
      const permitidos = TRANSICIONES_ADMIN[fila.estado] || [];
      if (nuevo === fila.estado) throw errorHttp(409, `La solicitud ya está "${ESTADOS[nuevo]}".`);
      if (!permitidos.includes(nuevo)) {
        throw errorHttp(409, `No se puede pasar de "${ESTADOS[fila.estado]}" a "${ESTADOS[nuevo]}".`);
      }
    } else if (CERRADOS.includes(fila.estado) && (notaEstudiante || notaPropietario)) {
      throw errorHttp(409, 'La solicitud está cerrada: solo se pueden agregar notas internas.');
    }

    // Roumix comparte la solicitud con el propietario cuando empieza a gestionarla
    compartidaAhora = !fila.compartida_propietario_en && nuevo && !['rechazada', 'cancelada'].includes(nuevo);
    if (notaPropietario && !fila.compartida_propietario_en && !compartidaAhora) {
      throw errorHttp(409, 'El propietario aún no conoce esta solicitud: pásala a "En revisión" para compartírsela.');
    }

    if (nuevo) {
      await cliente.query(
        `UPDATE solicitudes SET estado = $2::varchar,
           compartida_propietario_en = CASE WHEN $3::boolean THEN now() ELSE compartida_propietario_en END,
           cerrada_en = CASE WHEN $2::varchar IN ('rechazada', 'completada', 'cancelada') THEN now() ELSE NULL END
         WHERE id = $1`,
        [id, nuevo, compartidaAhora]
      );
      if (['en_negociacion', 'rechazada', 'cancelada'].includes(nuevo)) {
        await cancelarVigenteDeSolicitud(cliente, id, `La solicitud pasó a "${ESTADOS[nuevo]}".`);
      }
    } else {
      await cliente.query('UPDATE solicitudes SET updated_at = now() WHERE id = $1', [id]);
    }
    await registrarHistorial(cliente, {
      solicitudId: id, anterior: nuevo ? fila.estado : null, nuevo, autor: req.usuario.id, rol: 'admin',
      notaEstudiante, notaPropietario, notaInterna
    });
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  const urlBase = notificaciones.urlBase(req);
  const solicitud = { id, inmuebleTitulo: fila.inmueble_titulo };
  const tituloAviso = nuevo ? `Solicitud #${id}: ${ESTADOS[nuevo]}` : `Novedad en la solicitud #${id}`;
  if (nuevo || notaEstudiante) {
    await crearAviso({ usuarioId: fila.estudiante_id, tipo: 'solicitud', titulo: tituloAviso, cuerpo: notaEstudiante || fila.inmueble_titulo, enlace: 'solicitudes.html' });
  }
  if ((fila.compartida_propietario_en || compartidaAhora) && (nuevo || notaPropietario)) {
    await crearAviso({
      usuarioId: fila.propietario_id, tipo: 'solicitud',
      titulo: compartidaAhora ? `Nueva solicitud para ${fila.inmueble_titulo}` : tituloAviso,
      cuerpo: notaPropietario || fila.inmueble_titulo, enlace: 'solicitudes.html'
    });
  }
  if (nuevo || notaEstudiante) {
    await notificaciones.notificarSolicitudEstudiante({
      estudianteId: fila.estudiante_id, solicitud, estado: nuevo, etiqueta: nuevo ? ESTADOS[nuevo] : null, nota: notaEstudiante, urlBase
    });
  }
  const compartida = fila.compartida_propietario_en || compartidaAhora;
  if (compartida && (nuevo || notaPropietario)) {
    await notificaciones.notificarSolicitudPropietario({
      propietarioId: fila.propietario_id, solicitud, estado: nuevo, etiqueta: nuevo ? ESTADOS[nuevo] : null,
      nota: notaPropietario, nueva: compartidaAhora, urlBase
    });
  }

  res.json({
    status: 'success',
    message: nuevo ? `Solicitud #${id} actualizada a "${ESTADOS[nuevo]}".` : `Nota registrada en la solicitud #${id}.`,
    data: { id, estado: nuevo || fila.estado }
  });
}

module.exports = {
  ESTADOS,
  TRANSICIONES_ADMIN,
  crearSolicitud,
  misSolicitudes,
  cancelarSolicitud,
  listarAdmin,
  detalleAdmin,
  actualizarAdmin
};
