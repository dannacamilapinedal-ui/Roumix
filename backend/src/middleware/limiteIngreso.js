/**
 * Límite de intentos FALLIDOS de ingreso (además del CAPTCHA):
 *  - por cuenta (correo): 8 fallos en 15 minutos
 *  - por conexión (IP):   30 fallos en 15 minutos (varias personas pueden compartir red)
 * Solo cuentan los intentos con contraseña incorrecta; un ingreso correcto no suma.
 * Se guarda en la base de datos (limites_uso) para que funcione en Vercel.
 */
const limites = require('../services/limitesService');

const VENTANA_MIN = 15;
const MAX_POR_CORREO = 8;
const MAX_POR_IP = 30;

const claveCorreo = (email) => `ingreso-correo:${limites.huella(email)}`;
const claveIp = (req) => `ingreso-ip:${limites.huella(req.ip || 'desconocida')}`;

async function limiteIngreso(req, res, next) {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const [porCorreo, porIp] = await Promise.all([
      email ? limites.contar(claveCorreo(email), VENTANA_MIN) : { total: 0, primera: null },
      limites.contar(claveIp(req), VENTANA_MIN)
    ]);

    const bloqueo = porCorreo.total >= MAX_POR_CORREO ? porCorreo : porIp.total >= MAX_POR_IP ? porIp : null;
    if (bloqueo) {
      const minutos = limites.minutosRestantes(bloqueo.primera, VENTANA_MIN);
      return res.status(429).json({
        status: 'error',
        message: `Demasiados intentos fallidos. Por seguridad, espera ${minutos} minuto(s) o usa "¿Olvidaste tu contraseña?".`
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** Se llama cuando la contraseña es incorrecta. */
async function registrarFalloIngreso(req, email) {
  await Promise.all([
    email ? limites.registrar(claveCorreo(email)) : null,
    limites.registrar(claveIp(req))
  ]);
}

module.exports = { limiteIngreso, registrarFalloIngreso, MAX_POR_CORREO, MAX_POR_IP };
