// Prueba del módulo W-5a (condiciones de comisión versión 2026-12 y aviso a propietarios).
// Solo avisa a su propio propietario de prueba: nunca a los propietarios reales.
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';

const db = require(path.join(backend, 'src/config/db'));
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
const correos = [];
notificaciones.usarTransporte({ sendMail: async (m) => { correos.push(m); } });
const verificacion = require(path.join(backend, 'src/services/verificacionService'));
const cond = require(path.join(backend, 'src/controllers/condicionesController'));
const propCtrl = require(path.join(backend, 'src/controllers/propietarioController'));
const msg = require(path.join(backend, 'src/controllers/mensajesController'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, ip: '127.0.0.1', protocol: 'https', get: () => 'roumix.prueba', ...extra });

const idProp = crypto.randomUUID();
const sello = Date.now();

(async () => {
  try {
    await db.query(
      `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
       VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
      [idProp, `prueba-cond-${sello}@roumix.test`, JSON.stringify({ rol: 'propietario', nombre: 'Elena Prueba' })]);
    const prop = (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [idProp])).rows[0];
    // Como Danna y David: aprobada y con la versión anterior aceptada
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision, version_condiciones, acepta_comision_en)
      VALUES ($1, 'aprobado', 'Elena Prueba Ruiz', true, '2026-11', now() - interval '5 days')`, [idProp]);

    // 1. El texto nuevo
    ok(verificacion.VERSION_CONDICIONES === '2026-12' && /10 % del primer canon/.test(verificacion.CONDICIONES_COMISION)
      && /5 % de cada canon mensual cobrado/.test(verificacion.CONDICIONES_COMISION) && !/simulados/.test(verificacion.CONDICIONES_COMISION),
      'Versión 2026-12: mantiene el 10 % del primer mes y agrega el 5 % de cada mes cobrado por débito automático');
    ok(verificacion.TEXTOS_CONDICIONES['2026-11'] && verificacion.CAMBIOS_CONDICIONES.length === 3, 'Se conserva el texto de la versión anterior y la lista de cambios');

    // 2. Lo que ve el propietario que aceptó la versión anterior
    let r = res(); await propCtrl.obtenerVerificacion(req(prop), r);
    let v = r.cuerpo.data;
    ok(v.aceptaComision === true && v.condicionesAlDia === false && v.versionAceptada === '2026-11' && v.versionCondiciones === '2026-12',
      'Con la versión 2026-11 aceptada: "condiciones nuevas por aceptar" (no al día)');

    // 3. Resumen del panel
    r = res(); await cond.resumen(req(null), r);
    const antes = r.cuerpo.data;
    ok(antes.version === '2026-12' && antes.por_aceptar >= 1 && antes.por_avisar >= 1, `Panel: ${antes.por_aceptar} por aceptar, ${antes.por_avisar} por avisar`);

    // 4. Aviso (solo a la propietaria de prueba)
    const { avisados, correos: enviados } = await cond.avisarPropietarios([prop], null, 'https://roumix.prueba');
    ok(avisados === 1 && enviados === 1, 'Aviso enviado: en la plataforma y por correo');
    const correo = correos.find((c) => /actualizó las condiciones/.test(c.subject));
    ok(correo && /5 %/.test(correo.html) && /verificacion\.html#condiciones/.test(correo.html), 'El correo explica el 5 % y enlaza a Mi verificación');
    r = res(); await msg.misAvisos(req(prop), r);
    ok(r.cuerpo.data.some((a) => /actualizó las condiciones/.test(a.titulo) && a.enlace === 'verificacion.html#condiciones'), 'Aparece el aviso en la campana de la propietaria');
    const otra = await cond.avisarPropietarios([prop], null, 'https://roumix.prueba');
    ok(otra.avisados === 0 && correos.filter((c) => /actualizó las condiciones/.test(c.subject)).length === 1, 'Un segundo aviso no se envía (una sola vez por versión)');

    // 5. Acepta las condiciones nuevas
    r = res(); await propCtrl.aceptarCondiciones(req(prop, { body: { acepto: true } }), r);
    v = r.cuerpo.data;
    ok(v.condicionesAlDia === true && v.versionAceptada === '2026-12', 'Al aceptar queda al día con la versión 2026-12');
    const fila = (await db.query('SELECT version_condiciones FROM verificaciones_propietario WHERE propietario_id = $1', [idProp])).rows[0];
    ok(fila.version_condiciones === '2026-12', 'La base de datos guarda la versión aceptada');
    r = res(); await cond.resumen(req(null), r);
    ok(r.cuerpo.data.por_aceptar === antes.por_aceptar - 1, 'El panel ya no la cuenta entre las pendientes');
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    await db.query('DELETE FROM condiciones_avisos WHERE propietario_id = $1', [idProp]).catch(() => {});
    await db.query('DELETE FROM moderacion_historial WHERE usuario_afectado_id = $1', [idProp]).catch(() => {});
    await db.query('DELETE FROM auth.users WHERE id = $1', [idProp]);
    const quedan = (await db.query('SELECT count(*)::int n FROM usuarios WHERE id = $1', [idProp])).rows[0].n;
    console.log(quedan === 0 ? '🧹 Datos de prueba borrados' : '⚠️ Quedó el usuario de prueba');
    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
    await db.query('DELETE FROM auditoria WHERE es_prueba').catch(() => {});
    process.exitCode = fallos ? 1 : 0;
    await db.pool.end();
  }
})();
