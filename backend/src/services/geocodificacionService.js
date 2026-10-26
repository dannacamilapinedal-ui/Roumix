/**
 * Búsqueda de direcciones y sectores de Villavicencio con Nominatim (OpenStreetMap).
 *
 * Política de uso de Nominatim: máximo 1 petición por segundo, identificar la aplicación
 * y guardar en caché los resultados. Por eso la búsqueda pasa por el backend
 * (no desde cada navegador) y solo se hace cuando el propietario pulsa "Buscar".
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Caja de búsqueda: Villavicencio y alrededores (oeste, norte, este, sur)
const VIEWBOX = '-73.85,4.35,-73.40,3.95';
const AGENTE = 'Roumix/1.0 (proyecto academico USTA Villavicencio; roumix04@gmail.com)';
const CACHE_MS = 24 * 3600 * 1000;
const MAX_CACHE = 500;

const cache = new Map();
let ultimaPeticion = 0;
let cola = Promise.resolve();

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Encola las peticiones para respetar 1 por segundo
function turno() {
  const siguiente = cola.then(async () => {
    const espera = ultimaPeticion + 1100 - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaPeticion = Date.now();
  });
  cola = siguiente.catch(() => {});
  return siguiente;
}

async function buscarLugar(consulta) {
  const q = String(consulta || '').trim().slice(0, 150);
  if (q.length < 3) throw errorHttp(400, 'Escribe al menos 3 caracteres para buscar.');

  const clave = q.toLowerCase();
  const enCache = cache.get(clave);
  if (enCache && Date.now() - enCache.fecha < CACHE_MS) return enCache.resultados;

  await turno();

  const params = new URLSearchParams({
    q: `${q}, Villavicencio, Meta`,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'co',
    viewbox: VIEWBOX,
    bounded: '1',
    'accept-language': 'es'
  });

  let respuesta;
  try {
    respuesta = await fetch(`${URL_NOMINATIM}?${params}`, {
      headers: { 'User-Agent': AGENTE, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
  } catch (error) {
    throw errorHttp(502, 'El servicio de mapas no respondió. Marca la ubicación directamente en el mapa.');
  }
  if (!respuesta.ok) {
    throw errorHttp(502, 'El servicio de mapas no está disponible. Marca la ubicación directamente en el mapa.');
  }

  const datos = await respuesta.json();
  const resultados = datos.map((lugar) => ({
    nombre: lugar.display_name,
    latitud: Number(lugar.lat),
    longitud: Number(lugar.lon)
  }));

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(clave, { fecha: Date.now(), resultados });
  return resultados;
}

module.exports = { buscarLugar };
