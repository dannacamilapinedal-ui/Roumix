/**
 * Comprobaciones del correo antes de crear una cuenta.
 *
 * No es posible saber con certeza si un buzón existe sin enviarle un mensaje; eso lo hace el
 * correo de confirmación de Supabase. Aquí solo se descartan correos que con seguridad no
 * pueden recibir mensajes (dominio inexistente o sin servidor de correo) y los de servicios
 * de correo temporal, que se usan para crear cuentas desechables.
 */
const dns = require('dns').promises;

// Dominios reservados que nunca reciben correo (RFC 2606 / 6761)
const TLD_RESERVADOS = ['test', 'example', 'invalid', 'localhost', 'local'];
const DOMINIOS_RESERVADOS = ['example.com', 'example.net', 'example.org'];

// Servicios de correo temporal o desechable más usados
const DOMINIOS_TEMPORALES = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  'grr.la', '10minutemail.com', '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmail.net',
  'tempmailo.com', 'temp-mail.io', 'yopmail.com', 'yopmail.net', 'yopmail.fr', 'trashmail.com',
  'trashmail.de', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com',
  'throwawaymail.com', 'mintemail.com', 'emailondeck.com', 'mohmal.com', 'burnermail.io',
  'mailnesia.com', 'mytemp.email', 'tempail.com', 'spamgourmet.com', 'mailcatch.com', 'moakt.com',
  'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'emailfake.com', 'fakemail.net', 'mail.tm', 'mailpoof.com',
  'inboxkitten.com', 'discard.email', 'luxusmail.org', 'mailsac.com', 'harakirimail.com', '33mail.com'
]);

// Errores de escritura frecuentes en proveedores populares (algunos de estos dominios existen
// y reciben correo de terceros, así que la comprobación DNS no los detectaría)
const ERRORES_FRECUENTES = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
  'gmaill.com': 'gmail.com', 'gmail.om': 'gmail.com',
  'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'homail.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com'
};

const TIEMPO_DNS_MS = 4000;

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function conTiempoLimite(promesa) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), TIEMPO_DNS_MS))
  ]);
}

/**
 * ¿El dominio puede recibir correo? true / false, o null si no se pudo comprobar
 * (en ese caso no se bloquea a la persona por un fallo de red).
 */
async function dominioRecibeCorreo(dominio) {
  try {
    const mx = await conTiempoLimite(dns.resolveMx(dominio));
    // "Null MX" (RFC 7505): el dominio declara que no recibe correo
    if (mx.length === 1 && (mx[0].exchange === '' || mx[0].exchange === '.')) return false;
    if (mx.length > 0) return true;
  } catch (error) {
    if (!['ENODATA', 'ENOTFOUND'].includes(error.code)) return null;
    if (error.code === 'ENOTFOUND') return false; // el dominio no existe
  }
  // Sin registro MX: según el estándar, el correo puede llegar al registro A/AAAA del dominio
  try {
    const direcciones = await conTiempoLimite(dns.resolve(dominio));
    return direcciones.length > 0;
  } catch (error) {
    return ['ENODATA', 'ENOTFOUND'].includes(error.code) ? false : null;
  }
}

/**
 * Lanza un error 400 si el correo con seguridad no puede usarse para una cuenta.
 */
async function validarCorreoParaRegistro(email) {
  const dominio = email.split('@')[1].toLowerCase();
  const tld = dominio.split('.').pop();

  if (TLD_RESERVADOS.includes(tld) || DOMINIOS_RESERVADOS.includes(dominio)) {
    throw errorHttp(400, 'Ese correo no es válido. Usa un correo real al que tengas acceso.');
  }
  if (ERRORES_FRECUENTES[dominio]) {
    throw errorHttp(400, `¿Quisiste decir ${email.split('@')[0]}@${ERRORES_FRECUENTES[dominio]}? Revisa cómo escribiste el correo.`);
  }
  if (DOMINIOS_TEMPORALES.has(dominio) || [...DOMINIOS_TEMPORALES].some((d) => dominio.endsWith(`.${d}`))) {
    throw errorHttp(400, 'No se permiten correos temporales o desechables. Usa tu correo personal o institucional.');
  }

  const recibe = await dominioRecibeCorreo(dominio);
  if (recibe === false) {
    throw errorHttp(400, `El dominio "${dominio}" no existe o no recibe correos. Revisa que el correo esté bien escrito.`);
  }
  if (recibe === null) {
    console.warn(`⚠️ No se pudo comprobar el dominio ${dominio} (DNS); se permite el registro.`);
  }
}

module.exports = { validarCorreoParaRegistro, dominioRecibeCorreo };
