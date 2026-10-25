const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ quiet: true });

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

// Cliente usado por el backend para validar los tokens de sesión de Supabase Auth.
// Si faltan las variables, el backend arranca igual pero las rutas protegidas
// responden 503 hasta que se configuren.
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

module.exports = { supabase };
