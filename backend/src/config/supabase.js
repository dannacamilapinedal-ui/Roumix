const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ quiet: true });

/**
 * Limpia un valor copiado en el panel del hosting: espacios, comillas y el
 * prefijo "NOMBRE=" que a veces se pega junto con el valor.
 */
function limpiar(nombre, valor) {
  if (!valor) return '';
  let limpio = String(valor).trim();
  if (limpio.toUpperCase().startsWith(`${nombre}=`)) limpio = limpio.slice(nombre.length + 1).trim();
  return limpio.replace(/^["']|["']$/g, '').trim();
}

const SUPABASE_URL = limpiar('SUPABASE_URL', process.env.SUPABASE_URL).replace(/\/+$/, '');
const SUPABASE_ANON_KEY = limpiar('SUPABASE_ANON_KEY', process.env.SUPABASE_ANON_KEY);

// Si una variable está mal, el servidor arranca igual (la búsqueda sigue funcionando)
// y se indica cuál corregir; las rutas de sesión responden 503 hasta arreglarla.
const problemas = [];
if (!SUPABASE_URL) problemas.push('falta SUPABASE_URL');
else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
  problemas.push(`SUPABASE_URL no es válida (debe ser como https://<ref-del-proyecto>.supabase.co; empieza con "${SUPABASE_URL.slice(0, 12)}…")`);
}
if (!SUPABASE_ANON_KEY) problemas.push('falta SUPABASE_ANON_KEY');
else if (/\s/.test(SUPABASE_ANON_KEY)) problemas.push('SUPABASE_ANON_KEY contiene espacios');

if (problemas.length) {
  console.error(`❌ Autenticación desactivada: ${problemas.join('; ')}. Revisa las variables de entorno.`);
}

const authConfigurada = problemas.length === 0;

/**
 * Crea un cliente de Supabase sin estado. Se usa uno nuevo por petición para que
 * la sesión de un usuario nunca quede guardada en memoria compartida del servidor.
 * Con token, las operaciones (p. ej. Storage) se hacen en nombre de ese usuario
 * y Supabase aplica sus políticas de seguridad.
 */
function crearClienteSupabase(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  });
}

// Cliente usado para validar tokens (getUser no guarda estado).
const supabase = authConfigurada ? crearClienteSupabase() : null;

module.exports = { supabase, crearClienteSupabase, authConfigurada, SUPABASE_URL, SUPABASE_ANON_KEY };
