const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Falta DATABASE_URL en backend/.env (vea backend/.env.example).');
  process.exit(1);
}

// Configuramos el pool de conexiones
// Si nos conectamos a Supabase en la nube, se requiere SSL
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('supabase.co') || connectionString.includes('supabase.com')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('❌ Error en el pool de PostgreSQL:', err.message);
});

/**
 * Comprueba que la base de datos responde. Devuelve la latencia en ms.
 */
async function verificarConexion() {
  const inicio = Date.now();
  await pool.query('SELECT 1');
  return Date.now() - inicio;
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  verificarConexion,
  pool
};
