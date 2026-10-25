/**
 * Aplica en orden los archivos de database/migrations que aún no se han ejecutado.
 * Cada migración corre dentro de una transacción y queda registrada en schema_migrations.
 *
 * Uso (desde backend/):  npm run migrate
 *                        npm run migrate -- --seed   (además carga database/seeds.sql)
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const DATABASE_DIR = path.join(__dirname, '..', '..', 'database');
const MIGRATIONS_DIR = path.join(DATABASE_DIR, 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nombre TEXT PRIMARY KEY,
        aplicada_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');

    const { rows } = await client.query('SELECT nombre FROM schema_migrations');
    const aplicadas = new Set(rows.map((r) => r.nombre));

    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let nuevas = 0;

    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8');
      console.log(`▶ Aplicando ${archivo}...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [archivo]);
        await client.query('COMMIT');
        nuevas++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falló ${archivo}: ${error.message}`);
      }
    }

    console.log(nuevas ? `✅ ${nuevas} migración(es) aplicada(s).` : '✅ La base de datos ya está al día.');

    if (process.argv.includes('--seed')) {
      const seeds = fs.readFileSync(path.join(DATABASE_DIR, 'seeds.sql'), 'utf8');
      await client.query(seeds);
      console.log('🌱 Datos de demostración cargados.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('❌', error.message);
  process.exit(1);
});
