const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ quiet: true });

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

const authConfigurada = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Crea un cliente de Supabase sin estado. Se usa uno nuevo por petición para que
 * la sesión de un usuario nunca quede guardada en memoria compartida del servidor.
 */
function crearClienteSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// Cliente usado para validar tokens (getUser no guarda estado).
// Si faltan las variables, el backend arranca igual pero las rutas protegidas
// responden 503 hasta que se configuren.
const supabase = authConfigurada ? crearClienteSupabase() : null;

module.exports = { supabase, crearClienteSupabase, authConfigurada, SUPABASE_URL, SUPABASE_ANON_KEY };
