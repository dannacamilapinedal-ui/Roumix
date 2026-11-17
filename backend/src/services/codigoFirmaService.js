/**
 * Código de un solo uso para firmar un contrato (F-2).
 *
 * - 6 dígitos aleatorios; se guarda solo su huella SHA-256 con una sal propia.
 * - Vence a los 10 minutos, admite 5 intentos y se usa una vez.
 * - Pedir uno nuevo anula el anterior; como máximo 5 códigos por hora y uno cada 60 segundos.
 * El código solo sale del servidor por correo (nunca en una respuesta de la API).
 */
const crypto = require('crypto');
const db = require('../config/db');
const { huella: huellaIp } = require('./limitesService');

const MINUTOS_VIGENCIA = 10;
const MAX_INTENTOS = 5;
const SEGUNDOS_ENTRE_ENVIOS = 60;
const MAX_POR_HORA = 5;

function errorHttp(status, message) {
  return Object.assign(new Error(message), { status });
}

const huellaCodigo = (codigo, sal) => crypto.createHash('sha256').update(`${sal}:${codigo}`).digest('hex');

/** "dannacamila@gmail.com" → "d•••••@gmail.com" */
function ocultarCorreo(correo) {
  const [usuario, dominio] = String(correo || '').split('@');
  if (!dominio) return '•••';
  return `${usuario.slice(0, 1)}•••••@${dominio}`;
}

/**
 * Límite de envíos para esta parte y este contrato. Lanza 429 si debe esperar.
 */
async function revisarLimites(contratoId, usuarioId, cliente = db) {
  const { rows: [r] } = await cliente.query(
    `SELECT count(*)::int AS ultima_hora,
            max(created_at) AS ultimo
     FROM firmas_codigos WHERE contrato_id = $1 AND usuario_id = $2 AND created_at > now() - interval '1 hour'`,
    [contratoId, usuarioId]);
  if (r.ultimo) {
    const espera = SEGUNDOS_ENTRE_ENVIOS - Math.floor((Date.now() - new Date(r.ultimo).getTime()) / 1000);
    if (espera > 0) throw Object.assign(errorHttp(429, `Espera ${espera} segundos para pedir otro código.`), { esperar: espera });
  }
  if (r.ultima_hora >= MAX_POR_HORA) throw errorHttp(429, 'Pediste muchos códigos. Espera un rato e intenta de nuevo.');
}

/**
 * Crea un código nuevo para esta parte y este contrato (anula el anterior) y lo devuelve.
 * Uso interno: el controlador lo envía por correo; nunca se devuelve por la API.
 */
async function crearCodigo(contratoId, usuarioId, { correo, ip = null } = {}, cliente = db) {
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const sal = crypto.randomBytes(16).toString('hex');
  await cliente.query(
    `UPDATE firmas_codigos SET anulado_en = now()
     WHERE contrato_id = $1 AND usuario_id = $2 AND usado_en IS NULL AND anulado_en IS NULL`,
    [contratoId, usuarioId]);
  const { rows: [fila] } = await cliente.query(
    `INSERT INTO firmas_codigos (contrato_id, usuario_id, codigo_huella, sal, enviado_a, expira_en, ip_huella)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6), $7) RETURNING id, expira_en`,
    [contratoId, usuarioId, huellaCodigo(codigo, sal), sal, correo || '(prueba)', MINUTOS_VIGENCIA, ip ? huellaIp(ip) : null]);
  return { codigo, id: fila.id, expiraEn: fila.expira_en };
}

/**
 * Verifica el código y, si es correcto, lo marca como usado (una sola vez).
 * Cada intento fallido queda registrado aunque la operación que sigue falle.
 * Devuelve { id, enviadoA } del código usado.
 */
async function usarCodigo(contratoId, usuarioId, codigo) {
  const limpio = String(codigo || '').replace(/\D/g, '');
  if (limpio.length !== 6) throw errorHttp(400, 'Escribe el código de 6 dígitos que llegó a tu correo.');
  const { rows: [c] } = await db.query(
    `SELECT id, codigo_huella, sal, intentos, expira_en, enviado_a FROM firmas_codigos
     WHERE contrato_id = $1 AND usuario_id = $2 AND usado_en IS NULL AND anulado_en IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [contratoId, usuarioId]);
  if (!c) throw errorHttp(400, 'Primero pide el código para firmar: te lo enviamos a tu correo.');
  if (new Date(c.expira_en) <= new Date()) {
    await db.query('UPDATE firmas_codigos SET anulado_en = now() WHERE id = $1', [c.id]);
    throw errorHttp(400, `El código venció (dura ${MINUTOS_VIGENCIA} minutos). Pide uno nuevo.`);
  }
  const correcto = crypto.timingSafeEqual(Buffer.from(huellaCodigo(limpio, c.sal)), Buffer.from(c.codigo_huella));
  if (!correcto) {
    const intentos = c.intentos + 1;
    const agotado = intentos >= MAX_INTENTOS;
    await db.query(
      `UPDATE firmas_codigos SET intentos = $2, anulado_en = CASE WHEN $3 THEN now() ELSE anulado_en END WHERE id = $1`,
      [c.id, intentos, agotado]);
    throw errorHttp(agotado ? 429 : 400, agotado
      ? 'Escribiste mal el código demasiadas veces. Pide uno nuevo.'
      : `El código no es correcto. Te quedan ${MAX_INTENTOS - intentos} intento(s).`);
  }
  // Se marca como usado solo si nadie lo usó en paralelo
  const { rowCount } = await db.query('UPDATE firmas_codigos SET usado_en = now() WHERE id = $1 AND usado_en IS NULL', [c.id]);
  if (!rowCount) throw errorHttp(409, 'Este código ya se usó. Pide uno nuevo.');
  return { id: c.id, enviadoA: c.enviado_a };
}

module.exports = { crearCodigo, usarCodigo, revisarLimites, ocultarCorreo, MINUTOS_VIGENCIA, MAX_INTENTOS, SEGUNDOS_ENTRE_ENVIOS };
