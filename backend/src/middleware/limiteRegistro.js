/**
 * Límite de cuentas nuevas por conexión (IP): máximo 5 intentos de registro por hora.
 * Complementa al CAPTCHA para evitar que alguien cree cuentas en masa.
 * Se guarda en memoria: se reinicia cuando el servidor se reinicia, lo cual es suficiente
 * para frenar abusos sin necesitar otra base de datos.
 */
const MAX_POR_HORA = 5;
const VENTANA_MS = 60 * 60 * 1000;
const intentos = new Map(); // ip -> [marcas de tiempo]

function limiteRegistro(req, res, next) {
  const ahora = Date.now();
  const ip = req.ip || 'desconocida';
  const recientes = (intentos.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);

  if (recientes.length >= MAX_POR_HORA) {
    const minutos = Math.ceil((VENTANA_MS - (ahora - recientes[0])) / 60000);
    return res.status(429).json({
      status: 'error',
      message: `Se hicieron demasiados registros desde esta conexión. Inténtalo de nuevo en ${minutos} minuto(s).`
    });
  }

  recientes.push(ahora);
  intentos.set(ip, recientes);
  next();
}

// Limpieza periódica del registro en memoria
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, marcas] of intentos) {
    const vigentes = marcas.filter((t) => ahora - t < VENTANA_MS);
    if (vigentes.length) intentos.set(ip, vigentes);
    else intentos.delete(ip);
  }
}, 10 * 60 * 1000).unref();

module.exports = limiteRegistro;
