// Prueba del módulo 1 (verificación de propietarios) contra la base de datos real,
// con un propietario de prueba temporal (sin contraseña) que se borra al final.
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1'; // la auditoría marca estos registros como de prueba
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';

const db = require(path.join(backend, 'src/config/db'));
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
const correos = [];
notificaciones.usarTransporte({ sendMail: async (m) => { correos.push(m); } });
const propietarioCtrl = require(path.join(backend, 'src/controllers/propietarioController'));
const adminCtrl = require(path.join(backend, 'src/controllers/adminController'));
const inmueblesCtrl = require(path.join(backend, 'src/controllers/inmueblesController'));
const { requirePropietarioAprobado } = require(path.join(backend, 'src/middleware/verificacion'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
async function middleware(usuario) {
  const r = res(); let paso = false;
  await requirePropietarioAprobado(req(usuario), r, () => { paso = true; });
  return { paso, r };
}

const idPrueba = crypto.randomUUID();
const correoPrueba = `prueba-verif-${Date.now()}@roumix.test`;
let inmuebleId = null;

(async () => {
  // Propietario de prueba (correo confirmado → el trigger crea su perfil)
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(),
             '{"rol":"propietario","nombre":"Prueba Verificación"}', '{}', now(), now())`,
    [idPrueba, correoPrueba]
  );
  const prop = (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [idPrueba])).rows[0];
  const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
  ok(prop && prop.rol === 'propietario', 'Propietario de prueba creado (perfil por el trigger)');

  // 1. Recién registrado: perfil incompleto y no puede publicar
  let m = await middleware(prop);
  ok(!m.paso && m.r.codigo === 403 && m.r.cuerpo.etapa === 'incompleto', `Sin perfil no puede publicar → "${m.r.cuerpo.message}"`);
  let r = res(); await propietarioCtrl.obtenerVerificacion(req(prop), r);
  ok(r.cuerpo.data.etapa === 'incompleto' && r.cuerpo.data.puedePublicar === false, 'Su verificación aparece como "incompleto"');

  // 2. Validaciones del perfil
  const perfil = { nombreCompleto: 'Prueba Verificación Roumix', telefono: '310 123 4567', ciudad: 'Villavicencio', relacionInmueble: 'propietario', cantidadInmuebles: 2, zonas: 'Barzal', descripcion: 'Dos habitaciones cerca de la USTA.' };
  let e = await falla(() => propietarioCtrl.enviarPerfil(req(prop, { body: { ...perfil } }), res()));
  ok(e && e.status === 400 && /comisión/.test(e.message), 'Sin aceptar la comisión → 400');
  e = await falla(() => propietarioCtrl.enviarPerfil(req(prop, { body: { ...perfil, telefono: '123', aceptaComision: true } }), res()));
  ok(e && e.status === 400 && /celular/.test(e.message), 'Celular inválido → 400');

  // 3. Envío correcto → pendiente
  r = res(); await propietarioCtrl.enviarPerfil(req(prop, { body: { ...perfil, aceptaComision: true } }), r);
  ok(r.cuerpo.data.estado === 'pendiente' && r.cuerpo.data.etapa === 'pendiente' && r.cuerpo.data.aceptaComision, 'Perfil enviado → "pendiente" y condiciones aceptadas');
  const tel = (await db.query('SELECT telefono FROM usuarios WHERE id = $1', [idPrueba])).rows[0].telefono;
  ok(tel === '573101234567', `Teléfono normalizado y guardado solo para Roumix: ${tel}`);
  ok(correos.some((c) => /Propietario por revisar/.test(c.subject)), 'Correo a la administración: "Propietario por revisar"');
  m = await middleware(prop);
  ok(!m.paso && m.r.cuerpo.etapa === 'pendiente', 'En revisión todavía no puede publicar');

  // 4. Panel: aparece en "por revisar" y en el resumen
  r = res(); await adminCtrl.listarPropietarios(req(admin, { query: { estado: 'por_revisar' } }), r);
  ok(r.cuerpo.data.some((p) => p.id === idPrueba), 'Aparece en la pestaña "Por revisar"');
  r = res(); await adminCtrl.resumen(req(admin), r);
  ok(r.cuerpo.data.verificaciones.porRevisar >= 1, `Resumen: ${r.cuerpo.data.verificaciones.porRevisar} propietario(s) por revisar`);

  // 5. Decisiones del administrador
  e = await falla(() => adminCtrl.decidirVerificacion(req(admin, { params: { id: idPrueba }, body: { decision: 'solicitar_informacion' } }), res()));
  ok(e && e.status === 400, 'Pedir información sin mensaje → 400');
  e = await falla(() => adminCtrl.decidirVerificacion(req(admin, { params: { id: admin.id }, body: { decision: 'aprobar' } }), res()));
  ok(e && e.status === 403, 'Un admin no puede revisarse a sí mismo → 403');
  correos.length = 0;
  r = res(); await adminCtrl.decidirVerificacion(req(admin, { params: { id: idPrueba }, body: { decision: 'solicitar_informacion', mensaje: 'Indícanos el barrio exacto de tus inmuebles.' } }), r);
  ok(r.cuerpo.data.estado === 'requiere_informacion', 'Solicitar información → "requiere_informacion"');
  ok(correos.some((c) => c.to === correoPrueba && /información adicional/.test(c.subject)), 'Correo al propietario: "Roumix necesita información adicional"');
  r = res(); await propietarioCtrl.obtenerVerificacion(req(prop), r);
  ok(r.cuerpo.data.mensajeAdmin === 'Indícanos el barrio exacto de tus inmuebles.', 'El propietario ve el mensaje del equipo');

  // 6. Reenvío y aprobación con teléfono confirmado
  r = res(); await propietarioCtrl.enviarPerfil(req(prop, { body: { ...perfil, zonas: 'Barzal, cerca a la USTA', aceptaComision: true } }), r);
  ok(r.cuerpo.data.estado === 'pendiente', 'Reenvío → vuelve a "pendiente"');
  correos.length = 0;
  r = res(); await adminCtrl.decidirVerificacion(req(admin, { params: { id: idPrueba }, body: { decision: 'aprobar', telefonoVerificado: true } }), r);
  ok(r.cuerpo.data.estado === 'aprobado', 'Aprobar → "aprobado"');
  ok(correos.some((c) => c.to === correoPrueba && /aprobada/.test(c.subject)), 'Correo al propietario: "Tu cuenta de propietario fue aprobada"');
  r = res(); await propietarioCtrl.obtenerVerificacion(req(prop), r);
  ok(r.cuerpo.data.puedePublicar && r.cuerpo.data.telefonoVerificadoPorRoumix, 'Ya puede publicar y su teléfono figura "verificado por Roumix"');
  m = await middleware(prop);
  ok(m.paso, 'El control de publicar lo deja pasar');
  e = await falla(() => propietarioCtrl.enviarPerfil(req(prop, { body: { ...perfil, aceptaComision: true } }), res()));
  ok(e && e.status === 409, 'Con la cuenta aprobada no puede reenviar el perfil → 409');

  // 7. Las publicaciones de un propietario rechazado se ocultan
  inmuebleId = (await db.query(
    `INSERT INTO inmuebles (propietario_id, titulo, tipo, precio, barrio, universidad, estado, moderacion)
     VALUES ($1, 'Prueba de verificación (temporal)', 'habitacion', 400000, 'Barzal', 'Santo Tomás', 'disponible', 'aprobada') RETURNING id`,
    [idPrueba]
  )).rows[0].id;
  r = res(); await inmueblesCtrl.getInmuebles(req(null, { query: {} }), r);
  ok(r.cuerpo.data.some((i) => i.id === inmuebleId), 'Aprobado: su publicación se ve en la búsqueda');
  await adminCtrl.decidirVerificacion(req(admin, { params: { id: idPrueba }, body: { decision: 'rechazar', mensaje: 'Prueba automática de rechazo.' } }), res());
  r = res(); await inmueblesCtrl.getInmuebles(req(null, { query: {} }), r);
  ok(!r.cuerpo.data.some((i) => i.id === inmuebleId), 'Rechazado: su publicación desaparece de la búsqueda');

  // 8. Historial de decisiones
  const { rows: hist } = await db.query("SELECT accion FROM moderacion_historial WHERE usuario_afectado_id = $1 ORDER BY id", [idPrueba]);
  ok(hist.length >= 5, `Historial: ${hist.map((h) => h.accion).join(' → ')}`);
})()
  .catch((e) => { fallos++; console.error('Error en la prueba:', e); })
  .finally(async () => {
    // Limpieza: nada de la prueba queda en la base de datos
    if (inmuebleId) await db.query('DELETE FROM inmuebles WHERE id = $1', [inmuebleId]);
    await db.query('DELETE FROM moderacion_historial WHERE usuario_afectado_id = $1', [idPrueba]);
    await db.query('DELETE FROM auth.users WHERE id = $1', [idPrueba]);
    const quedan = (await db.query('SELECT count(*)::int n FROM usuarios WHERE id = $1', [idPrueba])).rows[0].n;
    console.log(quedan === 0 ? '🧹 Propietario de prueba eliminado' : '⚠️ No se pudo limpiar la prueba');
    await db.query('DELETE FROM auditoria WHERE es_prueba').catch(() => {});
    process.exitCode = fallos ? 1 : 0;
    await db.pool.end();
  });
