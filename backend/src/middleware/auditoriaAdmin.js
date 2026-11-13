/**
 * Registra en la auditoría cada acción del panel que cambia datos (POST, PUT, PATCH,
 * DELETE) y termina bien. Se monta en las rutas /api/admin después de requireAuth y
 * requireRol('admin'), así ninguna acción administrativa nueva queda sin rastro.
 *
 * El registro se escribe ANTES de enviar la respuesta (importante en Vercel, donde el
 * proceso puede congelarse en cuanto se responde).
 */
const { auditar, accionAdmin, datosSeguros } = require('../services/auditoriaService');

const METODOS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function auditoriaAdmin(req, res, next) {
  if (!METODOS.has(req.method)) return next();

  const jsonOriginal = res.json.bind(res);
  let registrado = false;
  res.json = (cuerpo) => {
    const exito = (res.statusCode || 200) < 400 && !(cuerpo && cuerpo.status === 'error');
    if (!exito || registrado) return jsonOriginal(cuerpo);
    registrado = true;
    const { accion, entidad, entidadId } = accionAdmin(req.method, req.path);
    const datos = datosSeguros(req.body);
    if (cuerpo && cuerpo.data && cuerpo.data.id !== undefined && entidad === 'conversacion' && !entidadId) {
      datos.conversacion_id = cuerpo.data.id;
    }
    const accionFinal = accion === 'mensaje_respondido' && req.body && req.body.interna === true ? 'nota_interna_registrada' : accion;
    auditar({
      actor: req.usuario,
      actorRol: 'admin',
      accion: accionFinal,
      entidad,
      entidadId: entidadId || (entidad === 'conversacion' && cuerpo && cuerpo.data ? cuerpo.data.id : null),
      resumen: cuerpo && cuerpo.message ? cuerpo.message : null,
      datos,
      ip: req.ip
    }).finally(() => jsonOriginal(cuerpo));
    return res;
  };
  next();
}

module.exports = auditoriaAdmin;
