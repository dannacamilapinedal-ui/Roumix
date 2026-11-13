/**
 * Solo un propietario con la cuenta APROBADA por Roumix puede crear o editar publicaciones.
 * Debe usarse después de requireAuth + requireRol('propietario').
 */
const verificacion = require('../services/verificacionService');

const MENSAJES = {
  incompleto: 'Antes de publicar, completa tu perfil de propietario para que Roumix lo revise.',
  pendiente: 'Tu perfil está en revisión. Podrás publicar en cuanto Roumix apruebe tu cuenta.',
  requiere_informacion: 'Roumix necesita información adicional sobre tu perfil antes de aprobarlo. Revisa el mensaje en "Mi verificación".',
  rechazado: 'Tu solicitud de verificación fue rechazada, por eso no puedes publicar. Revisa el mensaje en "Mi verificación".'
};

async function requirePropietarioAprobado(req, res, next) {
  try {
    const v = await verificacion.obtener(req.usuario.id);
    if (v.estado === 'aprobado') return next();
    const etapa = verificacion.etapa(v);
    return res.status(403).json({
      status: 'error',
      codigo: 'verificacion_requerida',
      etapa,
      message: MENSAJES[etapa] || MENSAJES.pendiente
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { requirePropietarioAprobado };
