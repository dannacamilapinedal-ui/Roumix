/**
 * Teselas del mapa (OpenStreetMap) servidas a través del backend.
 *
 * Los servidores de OpenStreetMap bloquean ("403 Access blocked") las peticiones que llegan
 * sin la cabecera Referer, algo que hacen algunos navegadores, extensiones de privacidad o
 * las páginas abiertas como archivo. El backend descarga cada tesela identificándose como
 * Roumix, la guarda en caché y la sirve con caché del navegador, como pide la política:
 * https://operations.osmfoundation.org/policies/tiles/
 *
 * Solo se sirven teselas de la región de Villavicencio para que esto no sea un proxy abierto.
 */

const URL_OSM = 'https://tile.openstreetmap.org';
const AGENTE = 'Roumix/1.0 (proyecto academico USTA Villavicencio; roumix04@gmail.com)';
const ZOOM_MAX = 19;
// Región permitida (Meta y alrededores) para zoom >= 8; con menos zoom las teselas son pocas
const REGION = { latMin: 2.5, latMax: 5.5, lngMin: -75.0, lngMax: -72.0 };
const MAX_CACHE = 1500;          // ~20-30 MB
const CACHE_MS = 7 * 24 * 3600 * 1000;

const cache = new Map();         // clave -> { fecha, datos }
const enCurso = new Map();       // evita descargar dos veces la misma tesela a la vez

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Coordenadas geográficas de la esquina noroeste de una tesela
function esquina(z, x, y) {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng };
}

function validar(z, x, y) {
  const n = 2 ** z;
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > ZOOM_MAX || x < 0 || y < 0 || x >= n || y >= n) {
    throw errorHttp(400, 'Tesela no válida.');
  }
  if (z < 8) return;
  const noroeste = esquina(z, x, y);
  const sureste = esquina(z, x + 1, y + 1);
  const fuera = sureste.lat > REGION.latMax || noroeste.lat < REGION.latMin ||
    sureste.lng < REGION.lngMin || noroeste.lng > REGION.lngMax;
  if (fuera) throw errorHttp(404, 'Fuera de la región de Roumix.');
}

async function descargar(z, x, y) {
  let respuesta;
  try {
    respuesta = await fetch(`${URL_OSM}/${z}/${x}/${y}.png`, {
      headers: { 'User-Agent': AGENTE },
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    throw errorHttp(502, 'No se pudo descargar el mapa.');
  }
  if (!respuesta.ok) throw errorHttp(502, `OpenStreetMap respondió ${respuesta.status}.`);
  return Buffer.from(await respuesta.arrayBuffer());
}

async function obtenerTesela(z, x, y) {
  validar(z, x, y);
  const clave = `${z}/${x}/${y}`;

  const guardada = cache.get(clave);
  if (guardada && Date.now() - guardada.fecha < CACHE_MS) {
    // Reordenar para que funcione como LRU
    cache.delete(clave);
    cache.set(clave, guardada);
    return guardada.datos;
  }

  if (!enCurso.has(clave)) {
    enCurso.set(clave, descargar(z, x, y).finally(() => enCurso.delete(clave)));
  }
  const datos = await enCurso.get(clave);

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(clave, { fecha: Date.now(), datos });
  return datos;
}

module.exports = { obtenerTesela };
