// Prueba del módulo 3 (solicitudes de arriendo) contra la BD real, con un estudiante,
// un propietario y un inmueble de prueba que se borran al final.
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
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));
const inm = require(path.join(backend, 'src/controllers/inmueblesController'));
const adminCtrl = require(path.join(backend, 'src/controllers/adminController'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enDias = (d) => new Date(Date.now() - 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);

const ids = { est: crypto.randomUUID(), prop: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;

async function crearUsuario(id, rol, nombre) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-sol-${rol}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}

(async () => {
  try {
    const est = await crearUsuario(ids.est, 'estudiante', 'Laura Prueba Gómez');
    const prop = await crearUsuario(ids.prop, 'propietario', 'Carlos Prueba');
    await db.query("UPDATE usuarios SET telefono = '573109998877' WHERE id = $1", [ids.prop]);
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado) VALUES ($1, 'aprobado')`, [ids.prop]);
    const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion, capacidad)
       VALUES ($1, 'Habitación prueba solicitudes', 'habitacion', 'Habitación', 700000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada', 2) RETURNING id`,
      [ids.prop])).rows[0].id;
    ok(est && prop && inmuebleId, 'Estudiante, propietario aprobado e inmueble de prueba creados');

    // 0. El teléfono del propietario ya no sale en la API pública (ni con sesión)
    let r = res(); await inm.getInmueblePorId(req(est, { params: { id: inmuebleId } }), r);
    ok(r.codigo === 200 && !('propietario_telefono' in r.cuerpo.data), 'El detalle ya no incluye el teléfono del propietario');

    // 1. Validaciones al crear
    const base = { inmuebleId, fechaIngreso: enDias(10), duracionMeses: 6, personas: 1, mensaje: 'Hola, soy estudiante de la USTA.' };
    let e = await falla(() => sol.crearSolicitud(req(est, { body: { ...base, fechaIngreso: enDias(-1) } }), res()));
    ok(e && e.status === 400 && /pasado/.test(e.message), 'Fecha en el pasado → 400');
    e = await falla(() => sol.crearSolicitud(req(est, { body: { ...base, fechaIngreso: '2026-02-30' } }), res()));
    ok(e && e.status === 400, 'Fecha imposible (30 de febrero) → 400');
    e = await falla(() => sol.crearSolicitud(req(est, { body: { ...base, duracionMeses: 30 } }), res()));
    ok(e && e.status === 400, 'Duración 30 meses → 400');
    e = await falla(() => sol.crearSolicitud(req(est, { body: { ...base, personas: 3 } }), res()));
    ok(e && e.status === 400 && /máximo 2/.test(e.message), `Más personas que la capacidad → 400 ("${e && e.message}")`);
    e = await falla(() => sol.crearSolicitud(req(est, { body: { ...base, inmuebleId: 999999 } }), res()));
    ok(e && e.status === 404, 'Inmueble inexistente → 404');

    // 2. Creación correcta
    correos.length = 0;
    r = res(); await sol.crearSolicitud(req(est, { body: base }), r);
    const id = r.cuerpo && r.cuerpo.data.id;
    ok(r.codigo === 201 && r.cuerpo.data.estado === 'recibida', `Solicitud #${id} creada → "recibida"`);
    ok(correos.some((c) => /Nueva solicitud de arriendo/.test(c.subject)), 'Correo a la administración: "Nueva solicitud de arriendo"');
    e = await falla(() => sol.crearSolicitud(req(est, { body: base }), res()));
    ok(e && e.status === 409, 'Segunda solicitud abierta para el mismo inmueble → 409');

    // 3. Vistas: estudiante sí, propietario todavía no
    r = res(); await sol.misSolicitudes(req(est), r);
    const vistaEst = r.cuerpo.data.find((s) => s.id === id);
    ok(vistaEst && vistaEst.historial.length === 1, 'El estudiante la ve con su historial');
    ok(!JSON.stringify(vistaEst).includes('573109998877') && !JSON.stringify(vistaEst).includes('prueba-sol-propietario'), 'El estudiante no recibe teléfono ni correo del propietario');
    r = res(); await sol.misSolicitudes(req(prop), r);
    ok(!r.cuerpo.data.some((s) => s.id === id), 'El propietario no la ve mientras Roumix no la comparta');

    // 4. Panel: lista, transiciones inválidas y estados reservados
    r = res(); await sol.listarAdmin(req(admin, { query: { estado: 'abiertas' } }), r);
    ok(r.cuerpo.data.some((s) => s.id === id && s.estudiante_email && s.propietario_telefono), 'El admin la ve con los datos de contacto de ambas partes');
    e = await falla(() => sol.actualizarAdmin(req(admin, { params: { id }, body: { estado: 'aceptada' } }), res()));
    ok(e && e.status === 409, 'Saltar de "recibida" a "aceptada" → 409');
    e = await falla(() => sol.actualizarAdmin(req(admin, { params: { id }, body: { estado: 'pagado' } }), res()));
    ok(e && e.status === 409 && /proveedor de pagos/.test(e.message), 'Marcar "pagado" a mano → 409');
    e = await falla(() => sol.actualizarAdmin(req(admin, { params: { id }, body: { estado: 'contrato_formalizado' } }), res()));
    ok(e && e.status === 409, 'Marcar "contrato formalizado" a mano → 409');
    e = await falla(() => sol.actualizarAdmin(req(admin, { params: { id }, body: { notaPropietario: 'Hola propietario' } }), res()));
    ok(e && e.status === 409, 'Escribirle al propietario antes de compartirla → 409');
    e = await falla(() => sol.actualizarAdmin(req(admin, { params: { id }, body: {} }), res()));
    ok(e && e.status === 400, 'Actualizar sin estado ni notas → 400');

    // 5. Roumix la pasa a revisión → se comparte con el propietario
    correos.length = 0;
    r = res(); await sol.actualizarAdmin(req(admin, { params: { id }, body: {
      estado: 'en_revision', notaEstudiante: 'Ya estamos hablando con el propietario.',
      notaPropietario: 'Una estudiante quiere tu habitación desde el próximo mes.', notaInterna: 'Llamar al propietario el lunes.' } }), r);
    ok(r.codigo === 200 && r.cuerpo.data.estado === 'en_revision', 'Recibida → "en_revision"');
    ok(correos.some((c) => /prueba-sol-estudiante/.test(c.to) && /En revisión/.test(c.subject)), 'Correo al estudiante con el nuevo estado');
    ok(correos.some((c) => /prueba-sol-propietario/.test(c.to) && /Tienes una solicitud/.test(c.subject)), 'Correo al propietario: "Tienes una solicitud de arriendo"');
    const correoProp = correos.find((c) => /prueba-sol-propietario/.test(c.to));
    ok(correoProp && !/prueba-sol-estudiante|Laura Prueba Gómez/.test(correoProp.html), 'El correo al propietario no incluye datos del estudiante');

    r = res(); await sol.misSolicitudes(req(prop), r);
    const vistaProp = r.cuerpo.data.find((s) => s.id === id);
    ok(vistaProp && vistaProp.estudiante_nombre === 'Laura', 'El propietario ya la ve, solo con el primer nombre del estudiante');
    const textoProp = JSON.stringify(vistaProp);
    ok(!textoProp.includes('prueba-sol-estudiante') && !textoProp.includes('USTA') && !textoProp.includes('Llamar al propietario'),
      'Sin correo del estudiante, sin su mensaje y sin notas internas');
    ok(vistaProp.historial.some((h) => /próximo mes/.test(h.nota || '')), 'El propietario ve la nota que Roumix le dejó');
    r = res(); await sol.misSolicitudes(req(est), r);
    const textoEst = JSON.stringify(r.cuerpo.data.find((s) => s.id === id));
    ok(textoEst.includes('Ya estamos hablando') && !textoEst.includes('próximo mes') && !textoEst.includes('Llamar al propietario'),
      'El estudiante ve solo su nota (ni la del propietario ni la interna)');

    // 6. Recorrido hasta contrato pendiente
    for (const estado of ['aceptada', 'visita_coordinada', 'en_negociacion', 'contrato_pendiente']) {
      r = res(); await sol.actualizarAdmin(req(admin, { params: { id }, body: { estado } }), r);
      ok(r.codigo === 200 && r.cuerpo.data.estado === estado, `→ "${estado}"`);
    }
    r = res(); await sol.detalleAdmin(req(admin, { params: { id } }), r);
    ok(r.cuerpo.data.historial.length === 6 && r.cuerpo.data.historial.some((h) => h.nota_interna), 'Historial completo para el admin (6 eventos, con nota interna)');

    // 7. Resumen del panel
    r = res(); await adminCtrl.resumen(req(admin), r);
    ok(r.cuerpo.data.solicitudes.abiertas >= 1, `Resumen: ${r.cuerpo.data.solicitudes.abiertas} solicitud(es) abierta(s)`);

    // 8. Cancelación del estudiante
    e = await falla(() => sol.cancelarSolicitud(req(prop, { params: { id } }), res()));
    ok(e && e.status === 404, 'Otro usuario no puede cancelarla → 404');
    correos.length = 0;
    r = res(); await sol.cancelarSolicitud(req(est, { params: { id }, body: { motivo: 'Encontré otra opción' } }), r);
    ok(r.codigo === 200 && r.cuerpo.data.estado === 'cancelada', 'El estudiante la cancela → "cancelada"');
    ok(correos.some((c) => /cancelada por el estudiante/.test(c.subject)) && correos.some((c) => /prueba-sol-propietario/.test(c.to)),
      'Avisos a la administración y al propietario');
    e = await falla(() => sol.cancelarSolicitud(req(est, { params: { id } }), res()));
    ok(e && e.status === 409, 'Cancelar dos veces → 409');
    e = await falla(() => sol.actualizarAdmin(req(admin, { params: { id }, body: { notaEstudiante: 'Hola de nuevo' } }), res()));
    ok(e && e.status === 409, 'Cerrada: solo admite notas internas → 409');

    // 9. Cerrada la anterior, puede volver a solicitar; rechazar exige explicación
    r = res(); await sol.crearSolicitud(req(est, { body: base }), r);
    const id2 = r.cuerpo.data.id;
    ok(r.codigo === 201, 'Tras cancelar puede enviar una nueva solicitud');
    e = await falla(() => sol.actualizarAdmin(req(admin, { params: { id: id2 }, body: { estado: 'rechazada' } }), res()));
    ok(e && e.status === 400, 'Rechazar sin explicación al estudiante → 400');
    correos.length = 0;
    r = res(); await sol.actualizarAdmin(req(admin, { params: { id: id2 }, body: { estado: 'rechazada', notaEstudiante: 'El propietario ya arrendó la habitación.' } }), r);
    ok(r.codigo === 200 && !correos.some((c) => /prueba-sol-propietario/.test(c.to)), 'Rechazada antes de compartirla: el propietario no recibe nada');

    // 10. Un inmueble retirado no recibe solicitudes
    await db.query("UPDATE inmuebles SET estado = 'retirado' WHERE id = $1", [inmuebleId]);
    e = await falla(() => sol.crearSolicitud(req(est, { body: base }), res()));
    ok(e && e.status === 404, 'Inmueble retirado → 404 "ya no está disponible"');
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    if (inmuebleId) {
      await db.query('DELETE FROM solicitudes WHERE inmueble_id = $1', [inmuebleId]);
      await db.query('DELETE FROM inmuebles WHERE id = $1', [inmuebleId]);
    }
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[ids.est, ids.prop]]);
    const quedan = (await db.query('SELECT count(*)::int n FROM usuarios WHERE id = ANY($1)', [[ids.est, ids.prop]])).rows[0].n;
    console.log(quedan === 0 ? '🧹 Datos de prueba borrados' : '⚠️ Quedaron usuarios de prueba');
    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
    await db.query('DELETE FROM auditoria WHERE es_prueba').catch(() => {});
    process.exitCode = fallos ? 1 : 0;
    await db.pool.end();
  }
})();
