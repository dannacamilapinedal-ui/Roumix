/**
 * Limpieza automática de cuentas que nunca confirmaron su correo.
 *
 * Quien se registra tiene 24 horas para abrir el enlace de confirmación. Pasado ese
 * tiempo la cuenta (en Supabase Auth) se elimina: así los correos falsos o mal escritos
 * no se acumulan y el correo queda libre para registrarse de nuevo.
 * Nunca se eliminan cuentas con perfil en Roumix (confirmadas) ni con inmuebles.
 */
const db = require('../config/db');

const HORAS_PARA_CONFIRMAR = 24;
const CADA_MS = 60 * 60 * 1000; // una vez por hora mientras el servidor está encendido

async function limpiarCuentasSinConfirmar() {
  const result = await db.query(
    `DELETE FROM auth.users a
     WHERE a.email_confirmed_at IS NULL
       AND a.created_at < now() - make_interval(hours => $1)
       AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = a.id)
       AND NOT EXISTS (SELECT 1 FROM public.inmuebles i WHERE i.propietario_id = a.id)
     RETURNING a.id`,
    [HORAS_PARA_CONFIRMAR]
  );
  return result.rowCount;
}

async function ejecutar() {
  try {
    const eliminadas = await limpiarCuentasSinConfirmar();
    if (eliminadas > 0) {
      console.log(`🧹 Se eliminaron ${eliminadas} cuenta(s) que no confirmaron el correo en ${HORAS_PARA_CONFIRMAR} h.`);
    }
  } catch (error) {
    console.error('⚠️ Limpieza de cuentas sin confirmar:', error.message);
  }
}

function iniciarLimpiezaPeriodica() {
  setTimeout(ejecutar, 15 * 1000).unref();          // poco después de arrancar
  setInterval(ejecutar, CADA_MS).unref();
}

module.exports = { limpiarCuentasSinConfirmar, iniciarLimpiezaPeriodica, HORAS_PARA_CONFIRMAR };
