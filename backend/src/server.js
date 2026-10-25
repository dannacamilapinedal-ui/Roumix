require('dotenv').config({ quiet: true });
const app = require('./app');
const db = require('./config/db');
const { supabase } = require('./config/supabase');

const PORT = process.env.PORT || 3000;

// Iniciar servidor
app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`🚀 Servidor Roumix iniciado`);
  console.log(`🌐 Aplicación:  http://localhost:${PORT}`);
  console.log(`🩺 Salud API:   http://localhost:${PORT}/api/health`);
  console.log(`🏠 Inmuebles:   http://localhost:${PORT}/api/inmuebles`);

  try {
    const ms = await db.verificarConexion();
    console.log(`📦 PostgreSQL (Supabase) conectado (${ms} ms)`);
  } catch (error) {
    console.error(`❌ No se pudo conectar a PostgreSQL: ${error.message}`);
  }

  if (!supabase) {
    console.warn('⚠️  Autenticación pendiente: defina SUPABASE_URL y SUPABASE_ANON_KEY en backend/.env');
  }
  console.log(`====================================================`);
});
