/**
 * Límite de cuentas nuevas por conexión (IP): máximo 15 intentos de registro por hora
 * (varias personas pueden compartir la misma red, por ejemplo el wifi de una universidad).
 * Complementa al CAPTCHA para evitar que alguien cree cuentas en masa.
 * Se guarda en la base de datos (limites_uso) para que funcione igual en Vercel,
 * donde cada petición puede atenderla una instancia distinta.
 */
const limites = require('../services/limitesService');

const MAX_POR_HORA = 15;
const VENTANA_MIN = 60;

async function limiteRegistro(req, res, next) {
  try {
    const clave = `registro:${limites.huella(req.ip || 'desconocida')}`;
    const { total, primera } = await limites.contar(clave, VENTANA_MIN);

    if (total >= MAX_POR_HORA) {
      const minutos = limites.minutosRestantes(primera, VENTANA_MIN);
      return res.status(429).json({
        status: 'error',
        message: `Se hicieron demasiados registros desde esta conexión. Inténtalo de nuevo en ${minutos} minuto(s).`
      });
    }

    await limites.registrar(clave);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = limiteRegistro;
