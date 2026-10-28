const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

// Se limpian espacios, comillas y el prefijo "DATABASE_URL=" que a veces se pega en el hosting
let connectionString = String(process.env.DATABASE_URL || '').trim();
if (connectionString.toUpperCase().startsWith('DATABASE_URL=')) connectionString = connectionString.slice(13).trim();
connectionString = connectionString.replace(/^["']|["']$/g, '').trim();

if (!connectionString) {
  console.error('❌ Falta DATABASE_URL en las variables de entorno (en local: backend/.env, vea backend/.env.example).');
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
  console.error('❌ DATABASE_URL no es válida: debe empezar por postgresql:// (cópiala desde Supabase → Connect).');
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
