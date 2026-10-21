const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

// Configuramos el pool de conexiones
// Si nos conectamos a Supabase en la nube, se requiere SSL
const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString && (connectionString.includes('supabase.co') || connectionString.includes('supabase.com'))
    ? { rejectUnauthorized: false }
    : false
});

pool.on('connect', () => {
  console.log('📦 Cliente conectado al pool de PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error en el pool de PostgreSQL:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
