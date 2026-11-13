// Prueba del módulo 6 (pagos SIMULADOS, comisión, desembolsos, devoluciones y disputas)
// contra la BD real, con usuarios, inmueble y solicitudes de prueba que se borran al final.
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
const pg = require(path.join(backend, 'src/controllers/pagosController'));
const ct = require(path.join(backend, 'src/controllers/contratosController'));
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));
const propCtrl = require(path.join(backend, 'src/controllers/propietarioController'));
const msg = require(path.join(backend, 'src/controllers/mensajesController'));
const adminCtrl = require(path.join(backend, 'src/controllers/adminController'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enDias = (d) => new Date(Date.now() - 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);

const ids = { e1: crypto.randomUUID(), e2: crypto.randomUUID(), e3: crypto.randomUUID(), prop: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;
let admin, prop;

async function crearUsuario(id, rol, nombre) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-pg-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}
const estadoSol = async (id) => (await db.query('SELECT estado FROM solicitudes WHERE id = $1', [id])).rows[0].estado;
const pagoDeSol = async (id) => (await db.query('SELECT * FROM pagos WHERE solicitud_id = $1 ORDER BY id DESC LIMIT 1', [id])).rows[0];

// Lleva una solicitud nueva del estudiante hasta el contrato formalizado
async function hastaFormalizado(est, nombre) {
  await db.query("UPDATE inmuebles SET estado = 'disponible' WHERE id = $1", [inmuebleId]);
  let r = res(); await sol.crearSolicitud(req(est, { body: { inmuebleId, fechaIngreso: enDias(15), duracionMeses: 6, personas: 1 } }), r);
  const solId = r.cuerpo.data.id;
  for (const estado of ['en_revision', 'aceptada', 'en_negociacion', 'contrato_pendiente']) {
    await sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado } }), res());
  }
  r = res(); await ct.crearBorrador(req(admin, { params: { id: solId }, body: { canonMensual: 800000, fechaInicio: enDias(15), duracionMeses: 6 } }), r);
  const ctId = r.cuerpo.data.id;
  await ct.enviarContrato(req(admin, { params: { id: ctId } }), res());
  await ct.aceptarContrato(req(est, { params: { id: ctId }, body: { firma: nombre, confirmo: true } }), res());
  await ct.aceptarContrato(req(prop, { params: { id: ctId }, body: { firma: 'Carlos Prueba Rodríguez', confirmo: true } }), res());
  return solId;
}

(async () => {
  try {
    const e1 = await crearUsuario(ids.e1, 'estudiante', 'Laura Prueba');
    const e2 = await crearUsuario(ids.e2, 'estudiante', 'Mateo Prueba');
    const e3 = await crearUsuario(ids.e3, 'estudiante', 'Sara Prueba');
    prop = await crearUsuario(ids.prop, 'propietario', 'Carlos');
    // Como los 2 propietarios reales: aprobado, pero sin haber aceptado la comisión
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision) VALUES ($1, 'aprobado', 'Carlos Prueba Rodríguez', false)`, [ids.prop]);
    admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba pagos', 'habitacion', 'Habitación', 800000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;
    ok(inmuebleId, 'Datos de prueba creados (propietario aprobado SIN aceptar la comisión)');

    // 1. Sin condiciones aceptadas no se habilita el pago
    const s1 = await hastaFormalizado(e1, 'Laura Prueba');
    ok(await estadoSol(s1) === 'contrato_formalizado' && !(await pagoDeSol(s1)), 'Contrato formalizado, pero el pago NO se habilita sin la comisión aceptada');
    let r = res(); await msg.misAvisos(req(prop), r);
    ok(r.cuerpo.data.some((a) => /Acepta las condiciones/.test(a.titulo)), 'El propietario recibe el aviso "Acepta las condiciones de la comisión"');
    let e = await falla(() => pg.habilitarAdmin(req(admin, { params: { id: s1 } }), res()));
    ok(e && e.status === 409 && /condiciones/.test(e.message), 'El admin tampoco puede habilitarlo → 409');
    r = res(); await pg.listarAdmin(req(admin, { query: {} }), r);
    ok(r.cuerpo.esperandoCondiciones.some((x) => x.id === s1), 'El panel lista la solicitud como "esperando condiciones"');

    // 2. El propietario acepta las condiciones → el pago se habilita solo
    e = await falla(() => propCtrl.aceptarCondiciones(req(prop, { body: {} }), res()));
    ok(e && e.status === 400, 'Aceptar sin marcar → 400');
    r = res(); await propCtrl.aceptarCondiciones(req(prop, { body: { acepto: true } }), r);
    const v = (await db.query('SELECT acepta_comision, version_condiciones FROM verificaciones_propietario WHERE propietario_id = $1', [ids.prop])).rows[0];
    ok(v.acepta_comision && v.version_condiciones === '2026-11' && /1 arriendo/.test(r.cuerpo.message), `Condiciones aceptadas (versión ${v.version_condiciones}) y pago habilitado: "${r.cuerpo.message}"`);
    let p1 = await pagoDeSol(s1);
    ok(p1 && p1.estado === 'pendiente' && p1.monto === 800000 && p1.comision === 80000 && p1.neto_propietario === 720000 && p1.simulado,
      'Pago #' + (p1 && p1.id) + ' pendiente: 800.000 = 80.000 de comisión (10 %) + 720.000 para el propietario, marcado como simulado');
    ok(await estadoSol(s1) === 'pago_pendiente', 'La solicitud pasó sola a "Pago pendiente"');

    // 3. Permisos
    e = await falla(() => pg.verPago(req(e2, { params: { id: p1.id } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede ver el pago → 404');
    e = await falla(() => pg.simularPago(req(e2, { params: { id: p1.id }, body: { metodo: 'pse_simulado', resultado: 'aprobado' } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede pagarlo → 404');
    r = res(); await pg.verPago(req(e1, { params: { id: p1.id } }), r);
    ok(!('comision' in r.cuerpo.data) && !('neto_propietario' in r.cuerpo.data) && r.cuerpo.simulado === true, 'El estudiante ve el monto, pero no la comisión ni el neto del propietario');
    r = res(); await pg.verPago(req(prop, { params: { id: p1.id } }), r);
    ok(r.cuerpo.data.comision === 80000 && r.cuerpo.data.neto_propietario === 720000, 'El propietario ve la comisión y su neto');
    e = await falla(() => pg.simularPago(req(e1, { params: { id: p1.id }, body: { metodo: 'tarjeta_real', resultado: 'aprobado' } }), res()));
    ok(e && e.status === 400, 'Método no simulado → 400');

    // 4. Pago rechazado y reintento aprobado
    r = res(); await pg.simularPago(req(e1, { params: { id: p1.id }, body: { metodo: 'tarjeta_simulada', resultado: 'rechazado' } }), r);
    p1 = await pagoDeSol(s1);
    ok(r.cuerpo.data.estado === 'fallido' && p1.intentos === 1 && await estadoSol(s1) === 'pago_pendiente', 'Rechazado por el simulador → "fallido", la solicitud sigue esperando el pago');
    correos.length = 0;
    r = res(); await pg.simularPago(req(e1, { params: { id: p1.id }, body: { metodo: 'nequi_simulado', resultado: 'aprobado' } }), r);
    p1 = await pagoDeSol(s1);
    ok(p1.estado === 'aprobado' && /^SIM-\d{8}-[0-9A-F]{6}$/.test(p1.referencia), `Reintento aprobado con referencia ${p1.referencia}`);
    ok(await estadoSol(s1) === 'pagado', 'La solicitud pasó sola a "Pagado"');
    const com = (await db.query('SELECT * FROM comisiones WHERE pago_id = $1', [p1.id])).rows[0];
    const des = (await db.query('SELECT * FROM desembolsos WHERE pago_id = $1', [p1.id])).rows[0];
    ok(com && com.monto === 80000 && com.version_condiciones === '2026-11' && com.estado === 'registrada', 'Comisión de 80.000 registrada con la versión de condiciones aceptada');
    ok(des && des.monto === 720000 && des.estado === 'pendiente', 'Desembolso de 720.000 pendiente');
    ok(correos.filter((c) => /simulado|Pago confirmado|pagó el primer mes|Pago aprobado/.test(c.subject + c.html)).length >= 3, 'Correos a estudiante, propietario y administración (rotulados como demostrativos)');
    ok(correos.every((c) => /demostrativo/i.test(c.html)), 'Todos los correos de pago dicen que es demostrativo');
    e = await falla(() => pg.simularPago(req(e1, { params: { id: p1.id }, body: { metodo: 'pse_simulado', resultado: 'aprobado' } }), res()));
    ok(e && e.status === 409, 'Pagar dos veces → 409');
    const intento = await falla(() => db.query('UPDATE pagos SET simulado = false WHERE id = $1', [p1.id]));
    ok(intento && /simulado/.test(intento.message), 'La base de datos impide marcar un pago como real (simulado = false)');
    r = res(); await pg.verPago(req(e1, { params: { id: p1.id } }), r);
    ok(r.cuerpo.data.eventos.filter((x) => x.tipo.startsWith('intento')).length === 2, 'El historial del pago registra los 2 intentos con su referencia y monto');

    // 5. Disputa: retiene el desembolso; se resuelve sin devolución
    e = await falla(() => pg.abrirDisputa(req(e1, { params: { id: p1.id }, body: { motivo: 'corto' } }), res()));
    ok(e && e.status === 400, 'Disputa sin explicación suficiente → 400');
    r = res(); await pg.abrirDisputa(req(e1, { params: { id: p1.id }, body: { motivo: 'La habitación no tenía el escritorio prometido.' } }), r);
    ok((await pagoDeSol(s1)).estado === 'en_disputa' && (await db.query('SELECT estado FROM desembolsos WHERE pago_id = $1', [p1.id])).rows[0].estado === 'retenido',
      'Disputa abierta → pago "en disputa" y desembolso retenido');
    e = await falla(() => pg.registrarDesembolso(req(admin, { params: { id: p1.id } }), res()));
    ok(e && e.status === 409, 'No se puede desembolsar con una disputa abierta → 409');
    r = res(); await pg.resolverDisputa(req(admin, { params: { id: p1.id }, body: { nota: 'El propietario instaló el escritorio.' } }), r);
    ok((await pagoDeSol(s1)).estado === 'aprobado', 'Disputa resuelta sin devolución → vuelve a "aprobado" y el desembolso a pendiente');

    // 6. Desembolso → solicitud completada
    r = res(); await pg.registrarDesembolso(req(admin, { params: { id: p1.id } }), r);
    const des2 = (await db.query('SELECT * FROM desembolsos WHERE pago_id = $1', [p1.id])).rows[0];
    ok(des2.estado === 'realizado' && /^DSB-/.test(des2.referencia), `Desembolso registrado (${des2.referencia})`);
    ok(await estadoSol(s1) === 'completada', 'La solicitud quedó "Completada"');
    e = await falla(() => pg.registrarDevolucion(req(admin, { params: { id: p1.id }, body: { motivo: 'Prueba de devolución tardía' } }), res()));
    ok(e && e.status === 409, 'Devolver después del desembolso → 409');
    e = await falla(() => pg.abrirDisputa(req(e1, { params: { id: p1.id }, body: { motivo: 'Otro problema con el inmueble.' } }), res()));
    ok(e && e.status === 409, 'Disputa después del desembolso → 409');

    // 7. Devolución (segundo estudiante)
    const s2 = await hastaFormalizado(e2, 'Mateo Prueba');
    const p2 = await pagoDeSol(s2);
    ok(p2 && p2.estado === 'pendiente', 'Con la comisión ya aceptada, el pago se habilita en cuanto se formaliza el contrato');
    await pg.simularPago(req(e2, { params: { id: p2.id }, body: { metodo: 'pse_simulado', resultado: 'aprobado' } }), res());
    r = res(); await pg.registrarDevolucion(req(admin, { params: { id: p2.id }, body: { motivo: 'El propietario canceló el arriendo antes de la entrega.' } }), r);
    const dv = (await db.query('SELECT * FROM devoluciones WHERE pago_id = $1', [p2.id])).rows[0];
    ok((await pagoDeSol(s2)).estado === 'reembolsado' && dv && dv.monto === 800000 && /^DEV-/.test(dv.referencia), `Devolución completa registrada (${dv && dv.referencia})`);
    ok((await db.query('SELECT estado FROM comisiones WHERE pago_id = $1', [p2.id])).rows[0].estado === 'anulada' &&
       (await db.query('SELECT estado FROM desembolsos WHERE pago_id = $1', [p2.id])).rows[0].estado === 'anulado', 'Comisión y desembolso anulados');
    ok(await estadoSol(s2) === 'cancelada', 'La solicitud quedó cancelada');

    // 8. Cancelar un pago pendiente (tercer estudiante)
    const s3 = await hastaFormalizado(e3, 'Sara Prueba');
    const p3 = await pagoDeSol(s3);
    r = res(); await pg.cancelarAdmin(req(admin, { params: { id: p3.id }, body: { motivo: 'La estudiante desistió antes de pagar.' } }), r);
    ok((await pagoDeSol(s3)).estado === 'cancelado' && await estadoSol(s3) === 'cancelada', 'Pago pendiente cancelado y solicitud cerrada');
    e = await falla(() => pg.simularPago(req(e3, { params: { id: p3.id }, body: { metodo: 'pse_simulado', resultado: 'aprobado' } }), res()));
    ok(e && e.status === 409, 'Un pago cancelado ya no se puede pagar → 409');

    // 9. Totales del panel y del resumen
    r = res(); await pg.listarAdmin(req(admin, { query: { estado: 'todos' } }), r);
    const t = r.cuerpo.totales;
    ok(t.comisiones >= 80000 && t.desembolsado >= 720000 && t.devuelto >= 800000, `Totales: comisiones ${t.comisiones}, desembolsado ${t.desembolsado}, devuelto ${t.devuelto}`);
    r = res(); await adminCtrl.resumen(req(admin), r);
    ok(typeof r.cuerpo.data.pagos.comisiones === 'number', 'El resumen del panel incluye los pagos');
    r = res(); await sol.misSolicitudes(req(e1), r);
    ok(r.cuerpo.data.find((x) => x.id === s1).pago.estado === 'aprobado', '"Mis solicitudes" muestra el pago');
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    const todos = Object.values(ids);
    await db.query('DELETE FROM conversaciones WHERE usuario_id = ANY($1)', [todos]);
    if (inmuebleId) {
      const pagosIds = (await db.query('SELECT p.id FROM pagos p JOIN solicitudes s ON s.id = p.solicitud_id WHERE s.inmueble_id = $1', [inmuebleId])).rows.map((x) => x.id);
      await db.query('DELETE FROM devoluciones WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM desembolsos WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM comisiones WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM pagos WHERE id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM contratos WHERE inmueble_id = $1', [inmuebleId]);
      await db.query('DELETE FROM solicitudes WHERE inmueble_id = $1', [inmuebleId]);
      await db.query('DELETE FROM inmuebles WHERE id = $1', [inmuebleId]);
    }
    await db.query('DELETE FROM moderacion_historial WHERE usuario_afectado_id = ANY($1)', [todos]).catch(() => {});
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [todos]);
    const quedan = (await db.query('SELECT count(*)::int n FROM usuarios WHERE id = ANY($1)', [todos])).rows[0].n;
    console.log(quedan === 0 ? '🧹 Datos de prueba borrados' : '⚠️ Quedaron usuarios de prueba');
    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
    await db.query('DELETE FROM auditoria WHERE es_prueba').catch(() => {});
    process.exitCode = fallos ? 1 : 0;
    await db.pool.end();
  }
})();
