/**
 * Límites de uso guardados en la base de datos (tabla limites_uso).
 *
 * En Vercel cada petición puede atenderla una instancia distinta, así que un contador
 * en memoria no sirve: el límite tiene que vivir en la base de datos para ser confiable.
 * Las IP y los correos no se guardan tal cual: se guarda una huella (hash) para no
 * acumular datos personales. La limpieza diaria borra las marcas de más de un día.
 *
 * Si la base de datos falla, el límite se deja pasar ("falla abierto"): un problema
 * técnico no debe impedir que la gente se registre o ingrese; el CAPTCHA sigue activo.
 */
const crypto = require('crypto');
const db = require('../config/db');

function huella(valor) {
  return crypto.createHash('sha256').update(`roumix|${String(valor || '').toLowerCase()}`).digest('hex').slice(0, 40);
}

/** Cuántas marcas tiene una clave en los últimos `minutos`. */
async function contar(clave, minutos) {
  try {
    const { rows } = await db.query(
      'SELECT count(*)::int AS total, min(creado_en) AS primera FROM limites_uso WHERE clave = $1 AND creado_en > now() - make_interval(mins => $2)',
      [clave, minutos]
    );
    return { total: rows[0].total, primera: rows[0].primera };
  } catch (error) {
    console.error('⚠️ Límite de uso (consulta):', error.message);
    return { total: 0, primera: null };
  }
}

/** Deja una marca para la clave. */
async function registrar(clave) {
  try {
    await db.query('INSERT INTO limites_uso (clave) VALUES ($1)', [clave]);
  } catch (error) {
    console.error('⚠️ Límite de uso (registro):', error.message);
  }
}

/** Minutos que faltan para que la marca más antigua salga de la ventana. */
function minutosRestantes(primera, minutos) {
  if (!primera) return minutos;
  const vence = new Date(primera).getTime() + minutos * 60000;
  return Math.max(1, Math.ceil((vence - Date.now()) / 60000));
}

module.exports = { huella, contar, registrar, minutosRestantes };
