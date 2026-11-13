// Prueba del módulo 4 (comunicación gestionada) contra la BD real, con un estudiante,
// un propietario, un inmueble y una solicitud de prueba que se borran al final.
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
const msg = require(path.join(backend, 'src/controllers/mensajesController'));
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));
const adminCtrl = require(path.join(backend, 'src/controllers/adminController'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enDias = (d) => new Date(Date.now() - 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);

const ids = { est: crypto.randomUUID(), prop: crypto.randomUUID(), otro: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;

async function crearUsuario(id, rol, nombre) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-msg-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}

(async () => {
  try {
    const est = await crearUsuario(ids.est, 'estudiante', 'Laura Prueba');
    const otro = await crearUsuario(ids.otro, 'estudiante', 'Otro Estudiante');
    const prop = await crearUsuario(ids.prop, 'propietario', 'Carlos Prueba');
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado) VALUES ($1, 'aprobado')`, [ids.prop]);
    const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba mensajes', 'habitacion', 'Habitación', 700000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;
    ok(est && prop && otro && inmuebleId, 'Usuarios e inmueble de prueba creados');

    // 1. Validaciones
    let e = await falla(() => msg.crearConversacion(req(est, { body: { asunto: 'Hola', mensaje: '' } }), res()));
    ok(e && e.status === 400, 'Mensaje vacío → 400');
    e = await falla(() => msg.crearConversacion(req(est, { body: { asunto: 'Pregunta', mensaje: 'x'.repeat(2001) } }), res()));
    ok(e && e.status === 400, 'Mensaje de más de 2000 caracteres → 400');
    e = await falla(() => msg.crearConversacion(req(prop, { body: { asunto: 'Pregunta', mensaje: 'Hola', inmuebleId: 7 } }), res()));
    ok(e && e.status === 404, 'Un propietario no puede abrir una consulta sobre un inmueble ajeno → 404');

    // 2. El estudiante pregunta por una vivienda
    correos.length = 0;
    let r = res(); await msg.crearConversacion(req(est, { body: { asunto: '¿Incluye internet?', mensaje: 'Hola, ¿el arriendo incluye internet?', inmuebleId } }), r);
    const c1 = r.cuerpo.data.id;
    ok(r.codigo === 201, `Conversación #${c1} creada`);
    ok(correos.some((c) => /Nueva consulta de Laura Prueba/.test(c.subject)), 'Correo a la administración: "Nueva consulta"');
    r = res(); await msg.misConversaciones(req(est), r);
    ok(r.cuerpo.data.some((c) => c.id === c1 && c.estado === 'pendiente' && c.inmueble_titulo === 'Habitación prueba mensajes'), 'Aparece en sus conversaciones como "pendiente" y con la vivienda');

    // 3. Aislamiento: ni otro estudiante ni el propietario la ven
    e = await falla(() => msg.verConversacion(req(otro, { params: { id: c1 } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede leerla → 404');
    e = await falla(() => msg.enviarMensaje(req(prop, { params: { id: c1 }, body: { mensaje: 'Hola, soy el dueño' } }), res()));
    ok(e && e.status === 404, 'El propietario no puede escribir en la conversación del estudiante → 404');
    r = res(); await msg.misConversaciones(req(prop), r);
    ok(!r.cuerpo.data.some((c) => c.id === c1), 'El propietario no la ve en su lista');

    // 4. El panel: lista, nota interna y respuesta
    r = res(); await msg.listarAdmin(req(admin, { query: { estado: 'pendiente' } }), r);
    ok(r.cuerpo.data.some((c) => c.id === c1 && c.sin_leer), 'El admin la ve como pendiente y sin leer');
    r = res(); await msg.responderAdmin(req(admin, { params: { id: c1 }, body: { mensaje: 'Verificar con el propietario si el internet es de fibra.', interna: true } }), r);
    ok(r.codigo === 201, 'Nota interna guardada');
    correos.length = 0;
    r = res(); await msg.responderAdmin(req(admin, { params: { id: c1 }, body: { mensaje: 'Sí, incluye internet de 200 Mbps.' } }), r);
    ok(r.codigo === 201 && correos.some((c) => /prueba-msg-estudiante/.test(c.to) && /Roumix te respondió/.test(c.subject)), 'Respuesta enviada y correo al estudiante');
    let est1 = (await db.query('SELECT estado FROM conversaciones WHERE id = $1', [c1])).rows[0].estado;
    ok(est1 === 'atendida', 'Tras responder queda "atendida"');

    r = res(); await msg.verConversacion(req(est, { params: { id: c1 } }), r);
    const textos = r.cuerpo.data.mensajes.map((m) => m.cuerpo).join(' | ');
    ok(r.cuerpo.data.mensajes.length === 2 && textos.includes('200 Mbps') && !textos.includes('fibra'), 'El estudiante ve la respuesta pero NO la nota interna');
    r = res(); await msg.detalleAdmin(req(admin, { params: { id: c1 } }), r);
    ok(r.cuerpo.data.mensajes.length === 3 && r.cuerpo.data.mensajes.some((m) => m.tipo === 'nota_interna'), 'El admin ve los 3 mensajes, incluida la nota interna');

    // 5. Avisos en la plataforma
    r = res(); await msg.misAvisos(req(est), r);
    ok(r.cuerpo.noLeidas === 0, 'Al abrir la conversación, el aviso de la respuesta queda leído');

    // 6. El estudiante vuelve a escribir → pendiente y un correo
    correos.length = 0;
    r = res(); await msg.enviarMensaje(req(est, { params: { id: c1 }, body: { mensaje: 'Gracias, ¿y el agua caliente?' } }), r);
    est1 = (await db.query('SELECT estado FROM conversaciones WHERE id = $1', [c1])).rows[0].estado;
    ok(est1 === 'pendiente' && correos.filter((c) => /Nuevo mensaje/.test(c.subject)).length === 1, 'Vuelve a "pendiente" y la administración recibe un correo');
    correos.length = 0;
    await msg.enviarMensaje(req(est, { params: { id: c1 }, body: { mensaje: 'Perdón, otra pregunta más.' } }), res());
    ok(correos.length === 0, 'Un segundo mensaje seguido no repite el correo');

    // 7. Marcar estado desde el panel
    r = res(); await msg.cambiarEstadoAdmin(req(admin, { params: { id: c1 }, body: { estado: 'atendida' } }), r);
    ok(r.codigo === 200, 'El admin la marca como atendida a mano');
    e = await falla(() => msg.cambiarEstadoAdmin(req(admin, { params: { id: c1 }, body: { estado: 'cerrada' } }), res()));
    ok(e && e.status === 400, 'Estado no válido → 400');

    // 8. Roumix le escribe al propietario sobre una solicitud
    r = res(); await sol.crearSolicitud(req(est, { body: { inmuebleId, fechaIngreso: enDias(10), duracionMeses: 6, personas: 1 } }), r);
    const solId = r.cuerpo.data.id;
    e = await falla(() => msg.iniciarAdmin(req(admin, { body: { solicitudId: solId, para: 'propietario', mensaje: 'Hola, ¿sigue disponible?' } }), res()));
    ok(e && e.status === 409, 'Escribirle al propietario antes de compartir la solicitud → 409');
    await sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado: 'en_revision', notaEstudiante: 'Estamos hablando con el propietario.' } }), res());
    r = res(); await msg.misAvisos(req(est), r);
    ok(r.cuerpo.data.some((a) => a.tipo === 'solicitud' && /En revisión/.test(a.titulo)), 'El estudiante recibe un aviso: "Solicitud: En revisión"');
    r = res(); await msg.misAvisos(req(prop), r);
    ok(r.cuerpo.data.some((a) => /Nueva solicitud para/.test(a.titulo)), 'El propietario recibe un aviso: "Nueva solicitud para…"');

    correos.length = 0;
    r = res(); await msg.iniciarAdmin(req(admin, { body: { solicitudId: solId, para: 'propietario', mensaje: 'Hola Carlos, una estudiante quiere la habitación. ¿Puede visitarla el sábado?' } }), r);
    const cProp = r.cuerpo.data.id;
    ok(r.codigo === 201 && correos.some((c) => /prueba-msg-propietario/.test(c.to)), `Roumix abre el hilo #${cProp} con el propietario y le llega un correo`);
    r = res(); await msg.iniciarAdmin(req(admin, { body: { solicitudId: solId, para: 'propietario', mensaje: 'Otro mensaje sobre lo mismo.' } }), r);
    ok(r.cuerpo.data.id === cProp, 'Un segundo mensaje sobre la misma solicitud usa el mismo hilo');
    r = res(); await msg.verConversacion(req(prop, { params: { id: cProp } }), r);
    const textoProp = JSON.stringify(r.cuerpo.data);
    ok(r.cuerpo.data.mensajes.length === 2 && !textoProp.includes('prueba-msg-estudiante') && !textoProp.includes('internet'),
      'El propietario ve solo sus mensajes con Roumix, sin datos del estudiante');
    r = res(); await msg.enviarMensaje(req(prop, { params: { id: cProp }, body: { mensaje: 'Sí, el sábado a las 10 a. m.' } }), r);
    ok(r.codigo === 201, 'El propietario responde a Roumix');
    r = res(); await msg.crearConversacion(req(prop, { body: { asunto: 'Sobre la solicitud', mensaje: 'Otra cosa', solicitudId: solId } }), r);
    ok(r.cuerpo.data.id === cProp, 'Si el propietario abre una consulta sobre la misma solicitud, va al mismo hilo');

    // 9. Resumen del panel y marcar avisos
    r = res(); await adminCtrl.resumen(req(admin), r);
    ok(r.cuerpo.data.conversaciones.pendientes >= 1, `Resumen: ${r.cuerpo.data.conversaciones.pendientes} conversación(es) pendiente(s)`);
    r = res(); await msg.marcarAvisosLeidos(req(prop), r);
    const sinLeer = (await db.query('SELECT count(*)::int n FROM notificaciones WHERE usuario_id = $1 AND leida_en IS NULL', [ids.prop])).rows[0].n;
    ok(sinLeer === 0, 'Marcar todas las novedades como leídas');
    e = await falla(() => msg.marcarAvisosLeidos(req(prop, { body: { ids: ['x'] } }), res()));
    ok(e && e.status === 400, 'ids no válidos → 400');

    // 10. Límite de conversaciones nuevas por día
    for (let i = 0; i < 4; i++) await msg.crearConversacion(req(otro, { body: { asunto: `Consulta ${i}`, mensaje: 'Hola' } }), res());
    await msg.crearConversacion(req(otro, { body: { asunto: 'Consulta 5', mensaje: 'Hola' } }), res());
    e = await falla(() => msg.crearConversacion(req(otro, { body: { asunto: 'Consulta 6', mensaje: 'Hola' } }), res()));
    ok(e && e.status === 429, 'La sexta conversación nueva del día → 429');
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    await db.query('DELETE FROM conversaciones WHERE usuario_id = ANY($1)', [[ids.est, ids.prop, ids.otro]]);
    if (inmuebleId) {
      await db.query('DELETE FROM solicitudes WHERE inmueble_id = $1', [inmuebleId]);
      await db.query('DELETE FROM inmuebles WHERE id = $1', [inmuebleId]);
    }
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[ids.est, ids.prop, ids.otro]]);
    const quedan = (await db.query('SELECT count(*)::int n FROM usuarios WHERE id = ANY($1)', [[ids.est, ids.prop, ids.otro]])).rows[0].n;
    console.log(quedan === 0 ? '🧹 Datos de prueba borrados' : '⚠️ Quedaron usuarios de prueba');
    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
    await db.query('DELETE FROM auditoria WHERE es_prueba').catch(() => {});
    process.exitCode = fallos ? 1 : 0;
    await db.pool.end();
  }
})();
