/**
 * Procedimiento controlado para dar o quitar el rol de administrador.
 * No existe ninguna ruta de la API ni opción del registro que lo haga:
 * solo quien tiene acceso a backend/.env (credenciales de la base de datos) puede ejecutarlo.
 *
 * Uso (desde backend/):
 *   npm run admin:asignar -- correo@ejemplo.com             -> vuelve admin a esa cuenta
 *   npm run admin:asignar -- correo@ejemplo.com --quitar    -> la devuelve a estudiante
 *
 * La cuenta debe existir: primero regístrate normalmente en Roumix y confirma el correo.
 */
const { pool } = require('../src/config/db');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const quitar = process.argv.includes('--quitar');

  if (!email || !email.includes('@')) {
    console.error('Uso: npm run admin:asignar -- correo@ejemplo.com [--quitar]');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, nombre, rol FROM usuarios WHERE email = $1 FOR UPDATE', [email]);
    if (rows.length === 0) throw new Error(`No existe un perfil con el correo ${email}. Regístrate primero en Roumix.`);

    const usuario = rows[0];
    const rolNuevo = quitar ? 'estudiante' : 'admin';
    if (usuario.rol === rolNuevo) {
      console.log(`ℹ️  ${email} ya tiene el rol ${rolNuevo}. No se hizo ningún cambio.`);
      await client.query('ROLLBACK');
      return;
    }
    if (!quitar && usuario.rol === 'propietario') {
      const { rows: [{ total }] } = await client.query(
        'SELECT count(*)::int AS total FROM inmuebles WHERE propietario_id = $1', [usuario.id]
      );
      if (total > 0) {
        throw new Error(`${email} es propietario con ${total} inmueble(s). Usa una cuenta distinta para administrar ` +
          '(así nadie modera sus propias publicaciones).');
      }
    }

    await client.query('UPDATE usuarios SET rol = $2 WHERE id = $1', [usuario.id, rolNuevo]);
    await client.query(
      `INSERT INTO moderacion_historial (usuario_afectado_id, admin_id, accion, justificacion)
       VALUES ($1, NULL, $2, $3)`,
      [usuario.id, quitar ? 'rol_admin_retirado' : 'rol_admin_asignado', 'Procedimiento controlado: scripts/asignar-admin.js']
    );
    await client.query('COMMIT');
    console.log(`✅ ${usuario.nombre} (${email}): ${usuario.rol} → ${rolNuevo}. Cierra sesión y vuelve a entrar.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
