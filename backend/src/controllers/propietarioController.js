/**
 * Espacio del propietario: su verificación.
 * Todas las rutas pasan por requireAuth + requireRol('propietario').
 */
const db = require('../config/db');
const verificacion = require('../services/verificacionService');
const notificaciones = require('../services/notificacionesService');

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function texto(valor, campo, min, max, { opcional = false } = {}) {
  const limpio = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
  if (!limpio && opcional) return null;
  if (limpio.length < min || limpio.length > max) {
    throw errorHttp(400, `${campo} debe tener entre ${min} y ${max} caracteres.`);
  }
  return limpio;
}

/** Celular colombiano al formato 57XXXXXXXXXX (mismo criterio del registro). */
function telefonoColombia(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (/^573\d{9}$/.test(digitos)) return digitos;
  throw errorHttp(400, 'Escribe un celular colombiano válido, por ejemplo 3101234567.');
}

/**
 * GET /api/propietario/verificacion
 */
async function obtenerVerificacion(req, res) {
  const v = await verificacion.obtener(req.usuario.id);
  res.json({ status: 'success', data: verificacion.vistaPropietario(v) });
}

/**
 * PUT /api/propietario/verificacion
 * Envía (o reenvía) el perfil para revisión. Deja la cuenta en "pendiente".
 */
async function enviarPerfil(req, res) {
  const body = req.body || {};
  const datos = {
    nombreCompleto: texto(body.nombreCompleto, 'El nombre completo', 5, 120),
    telefono: telefonoColombia(body.telefono),
    ciudad: texto(body.ciudad, 'La ciudad', 2, 80),
    relacion: String(body.relacionInmueble || ''),
    cantidad: Number(body.cantidadInmuebles),
    zonas: texto(body.zonas, 'Las zonas o barrios', 2, 300, { opcional: true }),
    descripcion: texto(body.descripcion, 'La descripción', 10, 1000, { opcional: true })
  };
  if (!verificacion.RELACIONES.includes(datos.relacion)) {
    throw errorHttp(400, 'Indica tu relación con los inmuebles (propietario, administrador, familiar u otro).');
  }
  if (!Number.isInteger(datos.cantidad) || datos.cantidad < 1 || datos.cantidad > 50) {
    throw errorHttp(400, 'Indica cuántos inmuebles piensas publicar (entre 1 y 50).');
  }
  if (body.aceptaComision !== true) {
    throw errorHttp(400, 'Para publicar en Roumix debes aceptar las condiciones de la comisión.');
  }

  const cliente = await db.pool.connect();
  let actualizado;
  try {
    await cliente.query('BEGIN');
    const actual = await verificacion.obtener(req.usuario.id, cliente);
    if (actual.estado === 'aprobado') {
      throw errorHttp(409, 'Tu cuenta ya está aprobada. Si necesitas cambiar tus datos, escríbele al equipo de Roumix.');
    }
    // Si cambia el teléfono, la marca "verificado por Roumix" deja de valer
    const mismoTelefono = actual.telefono === datos.telefono;

    const { rows } = await cliente.query(
      `UPDATE verificaciones_propietario SET
         estado = 'pendiente',
         nombre_completo = $2, telefono = $3, ciudad = $4, relacion_inmueble = $5,
         cantidad_inmuebles = $6, zonas = $7, descripcion = $8,
         perfil_enviado_en = now(),
         acepta_comision = true, acepta_comision_en = now(), version_condiciones = $9,
         telefono_verificado_por_roumix = CASE WHEN $10 THEN telefono_verificado_por_roumix ELSE false END,
         telefono_verificado_en = CASE WHEN $10 THEN telefono_verificado_en ELSE NULL END
       WHERE propietario_id = $1
       RETURNING *`,
      [req.usuario.id, datos.nombreCompleto, datos.telefono, datos.ciudad, datos.relacion,
        datos.cantidad, datos.zonas, datos.descripcion, verificacion.VERSION_CONDICIONES, mismoTelefono]
    );
    actualizado = rows[0];

    // El teléfono del perfil general se mantiene igual al de la verificación (solo lo ve Roumix)
    await cliente.query('UPDATE usuarios SET telefono = $2 WHERE id = $1', [req.usuario.id, datos.telefono]);

    await cliente.query(
      `INSERT INTO moderacion_historial (usuario_afectado_id, admin_id, accion, justificacion)
       VALUES ($1, NULL, 'verificacion_enviada', $2)`,
      [req.usuario.id, actual.perfil_enviado_en ? 'El propietario reenvió su perfil.' : 'El propietario envió su perfil para revisión.']
    );
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }

  const avisado = await notificaciones.notificarVerificacionPendiente({
    propietario: { nombre: actualizado.nombre_completo, email: req.usuario.email },
    urlBase: notificaciones.urlBase(req)
  });

  res.json({
    status: 'success',
    message: 'Enviamos tu perfil a revisión. Te avisaremos por correo cuando Roumix tome una decisión.',
    correoEnviado: avisado,
    data: verificacion.vistaPropietario(actualizado)
  });
}

module.exports = { obtenerVerificacion, enviarPerfil };
