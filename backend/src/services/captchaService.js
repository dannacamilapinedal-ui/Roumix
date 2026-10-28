/**
 * Verificación del CAPTCHA con Cloudflare Turnstile.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * El navegador resuelve el reto y recibe un token de un solo uso; el servidor lo confirma
 * con Cloudflare usando la clave secreta (que nunca llega al navegador).
 * Si las claves no están configuradas, el CAPTCHA queda desactivado y se avisa en el registro.
 */
require('dotenv').config({ quiet: true });

const URL_VERIFICACION = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const limpiar = (valor) => String(valor || '').trim().replace(/^["']|["']$/g, '').trim();
const SITE_KEY = limpiar(process.env.TURNSTILE_SITE_KEY);
const SECRET_KEY = limpiar(process.env.TURNSTILE_SECRET_KEY);
const captchaActivo = Boolean(SITE_KEY && SECRET_KEY);

if (!captchaActivo) {
  console.warn('⚠️  CAPTCHA desactivado: defina TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY para activarlo.');
}

/**
 * Devuelve true si Cloudflare confirma el token. Lanza error si Cloudflare no responde.
 */
async function verificarToken(token, ip) {
  const datos = new URLSearchParams({ secret: SECRET_KEY, response: token });
  if (ip) datos.append('remoteip', ip);

  let respuesta;
  try {
    respuesta = await fetch(URL_VERIFICACION, { method: 'POST', body: datos, signal: AbortSignal.timeout(8000) });
  } catch (error) {
    const err = new Error('No se pudo comprobar la verificación de seguridad. Inténtalo de nuevo.');
    err.status = 503;
    throw err;
  }
  const resultado = await respuesta.json().catch(() => ({}));
  return resultado.success === true;
}

module.exports = { captchaActivo, SITE_KEY, verificarToken };
