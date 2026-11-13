// Prueba del módulo 5 (contratos demostrativos) contra la BD real, con un estudiante,
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
const ct = require(path.join(backend, 'src/controllers/contratosController'));
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
    [id, `prueba-ct-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}
const estadoSolicitud = async (id) => (await db.query('SELECT estado FROM solicitudes WHERE id = $1', [id])).rows[0].estado;
const estadoContrato = async (id) => (await db.query('SELECT estado FROM contratos WHERE id = $1', [id])).rows[0].estado;

(async () => {
  try {
    const est = await crearUsuario(ids.est, 'estudiante', 'Laura Prueba Gómez');
    const otro = await crearUsuario(ids.otro, 'estudiante', 'Otro Estudiante');
    const prop = await crearUsuario(ids.prop, 'propietario', 'Carlos');
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo) VALUES ($1, 'aprobado', 'Carlos Prueba Rodríguez')`, [ids.prop]);
    const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba contratos', 'habitacion', 'Habitación', 800000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;
    let r = res(); await sol.crearSolicitud(req(est, { body: { inmuebleId, fechaIngreso: enDias(15), duracionMeses: 6, personas: 1 } }), r);
    const solId = r.cuerpo.data.id;
    ok(solId, `Datos de prueba creados (solicitud #${solId})`);

    const condiciones = { canonMensual: 800000, deposito: 800000, fechaInicio: enDias(15), duracionMeses: 6, diaPago: 5,
      inmuebleDireccion: 'Calle 40 # 30-15, Barzal', serviciosIncluidos: 'Agua, luz, internet', condiciones: 'No se permiten mascotas.' };

    // 1. Solo se prepara en "Contrato pendiente"
    let e = await falla(() => ct.crearBorrador(req(admin, { params: { id: solId }, body: condiciones }), res()));
    ok(e && e.status === 409, 'Crear contrato con la solicitud en "Recibida" → 409');
    for (const estado of ['en_revision', 'aceptada', 'en_negociacion', 'contrato_pendiente']) {
      await sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado } }), res());
    }
    ok(await estadoSolicitud(solId) === 'contrato_pendiente', 'Solicitud llevada a "Contrato pendiente"');

    // 2. Validaciones y borrador
    e = await falla(() => ct.crearBorrador(req(admin, { params: { id: solId }, body: { ...condiciones, diaPago: 31 } }), res()));
    ok(e && e.status === 400, 'Día de pago 31 → 400');
    e = await falla(() => ct.crearBorrador(req(admin, { params: { id: solId }, body: { ...condiciones, fechaInicio: '2026-02-30' } }), res()));
    ok(e && e.status === 400, 'Fecha de inicio imposible → 400');
    r = res(); await ct.crearBorrador(req(admin, { params: { id: solId }, body: condiciones }), r);
    const c1 = r.cuerpo.data.id;
    ok(r.codigo === 201, `Borrador del contrato #${c1} creado`);
    const fila = (await db.query('SELECT estudiante_nombre, propietario_nombre FROM contratos WHERE id = $1', [c1])).rows[0];
    ok(fila.estudiante_nombre === 'Laura Prueba Gómez' && fila.propietario_nombre === 'Carlos Prueba Rodríguez', 'Toma el nombre completo del perfil verificado del propietario');
    e = await falla(() => ct.crearBorrador(req(admin, { params: { id: solId }, body: condiciones }), res()));
    ok(e && e.status === 409, 'Un segundo contrato vigente para la misma solicitud → 409');

    // 3. Las partes no ven el borrador
    e = await falla(() => ct.verContrato(req(est, { params: { id: c1 } }), res()));
    ok(e && e.status === 404, 'El estudiante no ve el borrador → 404');
    r = res(); await ct.misContratos(req(prop), r);
    ok(r.cuerpo.data.length === 0, 'El propietario tampoco lo ve en su lista');

    // 4. Editar el borrador y enviar
    r = res(); await ct.editarBorrador(req(admin, { params: { id: c1 }, body: { ...condiciones, canonMensual: 780000 } }), r);
    ok(r.codigo === 200, 'Borrador editado (canon 780.000)');
    correos.length = 0;
    r = res(); await ct.enviarContrato(req(admin, { params: { id: c1 } }), r);
    ok(r.codigo === 200 && await estadoContrato(c1) === 'enviado', 'Contrato enviado → "enviado"');
    ok(correos.filter((c) => /listo para revisar/.test(c.subject)).length === 2, 'Correo a ambas partes: "listo para revisar"');
    e = await falla(() => ct.editarBorrador(req(admin, { params: { id: c1 }, body: condiciones }), res()));
    ok(e && e.status === 409, 'Editar un contrato ya enviado → 409');

    // 5. Lo que ve cada parte
    r = res(); await ct.verContrato(req(est, { params: { id: c1 } }), r);
    const vista = r.cuerpo.data;
    ok(vista.canon_mensual === 780000 && vista.puedo_aceptar && vista.huella_valida, 'El estudiante lo ve, puede aceptarlo y la huella es válida');
    const texto = JSON.stringify(vista);
    ok(!texto.includes('prueba-ct-') && !('propietario_id' in vista) && !('estudiante_id' in vista), 'El documento no incluye correos ni identificadores internos');
    e = await falla(() => ct.verContrato(req(otro, { params: { id: c1 } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede verlo → 404');

    // 6. Aceptación
    e = await falla(() => ct.aceptarContrato(req(est, { params: { id: c1 }, body: { firma: 'Laura Prueba Gómez' } }), res()));
    ok(e && e.status === 400, 'Aceptar sin confirmar la lectura → 400');
    e = await falla(() => ct.aceptarContrato(req(otro, { params: { id: c1 }, body: { firma: 'Otro Estudiante', confirmo: true } }), res()));
    ok(e && e.status === 404, 'Un tercero no puede aceptarlo → 404');
    correos.length = 0;
    r = res(); await ct.aceptarContrato(req(est, { params: { id: c1 }, body: { firma: 'Laura Prueba Gómez', confirmo: true } }), r);
    ok(r.cuerpo.data.estado === 'pendiente_aceptacion' && await estadoSolicitud(solId) === 'contrato_pendiente',
      'El estudiante acepta → "pendiente de aceptación" (la solicitud sigue en contrato pendiente)');
    ok(correos.some((c) => /prueba-ct-propietario/.test(c.to) && /Falta tu aceptación/.test(c.subject)), 'Correo al propietario: "Falta tu aceptación"');
    e = await falla(() => ct.aceptarContrato(req(est, { params: { id: c1 }, body: { firma: 'Laura Prueba Gómez', confirmo: true } }), res()));
    ok(e && e.status === 409, 'Aceptar dos veces → 409');

    // 7. Integridad: si alguien altera el contenido en la base, ya no se puede aceptar
    await db.query('UPDATE contratos SET canon_mensual = 1 WHERE id = $1', [c1]);
    r = res(); await ct.verContrato(req(prop, { params: { id: c1 } }), r);
    ok(r.cuerpo.data.huella_valida === false, 'Contenido alterado: la huella deja de coincidir');
    e = await falla(() => ct.aceptarContrato(req(prop, { params: { id: c1 }, body: { firma: 'Carlos Prueba Rodríguez', confirmo: true } }), res()));
    ok(e && e.status === 409, 'Contenido alterado: no se puede aceptar → 409');
    await db.query('UPDATE contratos SET canon_mensual = 780000 WHERE id = $1', [c1]);

    // 8. El propietario acepta → formalizado y la solicitud pasa sola
    correos.length = 0;
    r = res(); await ct.aceptarContrato(req(prop, { params: { id: c1 }, body: { firma: 'Carlos Prueba Rodríguez', confirmo: true } }), r);
    ok(r.cuerpo.data.estado === 'formalizado', 'El propietario acepta → contrato "formalizado"');
    ok(await estadoSolicitud(solId) === 'contrato_formalizado', 'La solicitud pasó sola a "Contrato formalizado"');
    const hist = (await db.query("SELECT autor_rol FROM solicitudes_historial WHERE solicitud_id = $1 AND estado_nuevo = 'contrato_formalizado'", [solId])).rows;
    ok(hist.length === 1 && hist[0].autor_rol === 'sistema', 'El cambio quedó en el historial como hecho por el sistema');
    ok(correos.filter((c) => /formalizado/.test(c.subject)).length >= 3, 'Correos de "formalizado" a ambas partes y a la administración');
    e = await falla(() => ct.cancelarContrato(req(admin, { params: { id: c1 }, body: { motivo: 'Prueba de cancelación' } }), res()));
    ok(e && e.status === 409, 'Cancelar un contrato formalizado → 409');
    e = await falla(() => sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado: 'pago_pendiente' } }), res()));
    ok(e && e.status === 409, 'El admin sigue sin poder poner "Pago pendiente" a mano → 409');

    r = res(); await sol.misSolicitudes(req(est), r);
    ok(r.cuerpo.data.find((s) => s.id === solId).contrato.estado === 'formalizado', '"Mis solicitudes" muestra el contrato formalizado');

    // 9. Cancelación automática y expiración (segunda solicitud)
    await db.query("UPDATE inmuebles SET estado = 'disponible' WHERE id = $1", [inmuebleId]);
    r = res(); await sol.crearSolicitud(req(otro, { body: { inmuebleId, fechaIngreso: enDias(20), duracionMeses: 3, personas: 1 } }), r);
    const sol2 = r.cuerpo.data.id;
    for (const estado of ['en_revision', 'aceptada', 'en_negociacion', 'contrato_pendiente']) {
      await sol.actualizarAdmin(req(admin, { params: { id: sol2 }, body: { estado } }), res());
    }
    r = res(); await ct.crearBorrador(req(admin, { params: { id: sol2 }, body: { ...condiciones, fechaInicio: enDias(20), duracionMeses: 3 } }), r);
    const c2 = r.cuerpo.data.id;
    await ct.enviarContrato(req(admin, { params: { id: c2 } }), res());
    await sol.actualizarAdmin(req(admin, { params: { id: sol2 }, body: { estado: 'en_negociacion', notaEstudiante: 'Volvemos a negociar el precio.' } }), res());
    ok(await estadoContrato(c2) === 'cancelado', 'Si la solicitud vuelve a negociación, el contrato enviado se cancela solo');

    await sol.actualizarAdmin(req(admin, { params: { id: sol2 }, body: { estado: 'contrato_pendiente' } }), res());
    r = res(); await ct.crearBorrador(req(admin, { params: { id: sol2 }, body: { ...condiciones, fechaInicio: enDias(20), duracionMeses: 3 } }), r);
    const c3 = r.cuerpo.data.id;
    ok(r.codigo === 201, 'Tras cancelar, se puede crear un contrato nuevo');
    await ct.enviarContrato(req(admin, { params: { id: c3 } }), res());
    await db.query("UPDATE contratos SET vence_en = now() - interval '1 minute' WHERE id = $1", [c3]);
    e = await falla(() => ct.aceptarContrato(req(otro, { params: { id: c3 }, body: { firma: 'Otro Estudiante', confirmo: true } }), res()));
    ok(e && e.status === 409 && await estadoContrato(c3) === 'expirado', 'Vencido el plazo → "expirado" y ya no se puede aceptar');

    r = res(); await ct.listarAdmin(req(admin, { query: { estado: 'todos' } }), r);
    ok([c1, c2, c3].every((id) => r.cuerpo.data.some((c) => c.id === id)), 'El panel lista los 3 contratos');
    r = res(); await adminCtrl.resumen(req(admin), r);
    ok(r.cuerpo.data.contratos.formalizados >= 1, `Resumen: ${r.cuerpo.data.contratos.formalizados} contrato(s) formalizado(s)`);
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    await db.query('DELETE FROM conversaciones WHERE usuario_id = ANY($1)', [[ids.est, ids.prop, ids.otro]]);
    if (inmuebleId) {
      await db.query('DELETE FROM contratos WHERE inmueble_id = $1', [inmuebleId]);
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
