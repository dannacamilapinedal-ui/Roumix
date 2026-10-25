const crypto = require('crypto');
const { crearClienteSupabase, SUPABASE_URL } = require('../config/supabase');

const BUCKET = 'inmuebles';
const MAX_FOTOS_POR_INMUEBLE = 10;
const MAX_FOTOS_POR_ENVIO = 8;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, igual que el límite del bucket

const PREFIJO_URL_PUBLICA = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Identifica el formato real por los primeros bytes del archivo.
 * No se confía en el nombre ni en el tipo que declara el navegador.
 */
function detectarFormato(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

/**
 * Valida todas las fotos antes de subir cualquiera.
 */
function validarFotos(archivos) {
  return archivos.map((archivo) => {
    const formato = detectarFormato(archivo.buffer);
    if (!formato) throw errorHttp(400, `"${archivo.originalname}" no es una imagen JPG, PNG o WebP válida.`);
    if (archivo.size > MAX_BYTES) throw errorHttp(400, `"${archivo.originalname}" supera el máximo de 5 MB.`);
    return { archivo, formato };
  });
}

/**
 * Ruta del archivo dentro del bucket a partir de su URL pública.
 * Devuelve null si la URL no pertenece al bucket de Roumix (p. ej. fotos de demostración).
 */
function rutaDesdeUrl(url) {
  return typeof url === 'string' && url.startsWith(PREFIJO_URL_PUBLICA)
    ? decodeURIComponent(url.slice(PREFIJO_URL_PUBLICA.length))
    : null;
}

/**
 * Borra fotos del bucket. No lanza error: si falla, solo lo registra,
 * porque no debe impedir la operación principal.
 */
async function borrarFotos(token, urls) {
  const rutas = urls.map(rutaDesdeUrl).filter(Boolean);
  if (rutas.length === 0) return;

  const { error } = await crearClienteSupabase(token).storage.from(BUCKET).remove(rutas);
  if (error) console.error('⚠️ No se pudieron borrar fotos de Storage:', error.message);
}

/**
 * Sube las fotos a inmuebles/<propietarioId>/<uuid>.<ext> con la sesión del propietario.
 * Si alguna falla, borra las que ya se habían subido y lanza el error.
 * Devuelve las URL públicas en el mismo orden.
 */
async function subirFotos(token, propietarioId, archivos) {
  const validadas = validarFotos(archivos);
  const storage = crearClienteSupabase(token).storage.from(BUCKET);
  const urls = [];

  try {
    for (const { archivo, formato } of validadas) {
      const ruta = `${propietarioId}/${crypto.randomUUID()}.${formato.ext}`;
      const { error } = await storage.upload(ruta, archivo.buffer, {
        contentType: formato.contentType,
        upsert: false
      });
      if (error) throw errorHttp(502, `No se pudo subir "${archivo.originalname}": ${error.message}`);
      urls.push(storage.getPublicUrl(ruta).data.publicUrl);
    }
  } catch (error) {
    await borrarFotos(token, urls);
    throw error;
  }

  return urls;
}

module.exports = {
  subirFotos,
  borrarFotos,
  rutaDesdeUrl,
  MAX_FOTOS_POR_INMUEBLE,
  MAX_FOTOS_POR_ENVIO,
  MAX_BYTES
};
