/**
 * Manejo centralizado de errores.
 * En producción no se exponen detalles internos (mensajes de PostgreSQL, etc.).
 */
function errorHandler(err, req, res, next) {
  console.error(`❌ ${req.method} ${req.originalUrl}:`, err.message);

  if (res.headersSent) return next(err);

  // JSON mal formado en el cuerpo de la petición
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ status: 'error', message: 'El cuerpo de la petición no es un JSON válido.' });
  }

  const status = err.status || 500;
  const respuesta = {
    status: 'error',
    message: status === 500 ? 'Error interno del servidor.' : err.message
  };
  if (status === 500 && process.env.NODE_ENV !== 'production') respuesta.detalle = err.message;

  res.status(status).json(respuesta);
}

module.exports = errorHandler;
