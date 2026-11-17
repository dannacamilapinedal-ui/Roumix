// Prueba del módulo W-3 ("Paga mi acudiente": enlace de pago de 24 h) contra la BD real.
// Usa llaves de Wompi inventadas y simula su API y su webhook (no se conecta a Wompi).
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';
process.env.WOMPI_PUBLIC_KEY = 'pub_test_roumixprueba';
process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_roumixprueba';
process.env.WOMPI_EVENTS_SECRET = 'test_events_roumixprueba';
delete process.env.WOMPI_PRIVATE_KEY;

const db = require(path.join(backend, 'src/config/db'));
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
notificaciones.usarTransporte({ sendMail: async () => {} });
const ac = require(path.join(backend, 'src/controllers/acudienteController'));
const wc = require(path.join(backend, 'src/controllers/wompiController'));
const pg = require(path.join(backend, 'src/controllers/pagosController'));
const ct = require(path.join(backend, 'src/controllers/contratosController'));
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, ip: '127.0.0.1', protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enDias = (d) => new Date(Date.now() - 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const codigoDe = (url) => new URL(url).searchParams.get('c');

let reloj = Math.floor(Date.now() / 1000);
function evento(tx) {
  const ts = ++reloj;
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = sha(`${tx.id}${tx.status}${tx.amount_in_cents}${ts}${process.env.WOMPI_EVENTS_SECRET}`);
  return { event: 'transaction.updated', data: { transaction: tx }, environment: 'test', signature: { properties, checksum }, timestamp: ts, sent_at: new Date().toISOString() };
}
async function webhook(ev) { const r = res(); await wc.recibirEvento(req(null, { body: ev, get: () => undefined }), r); return r; }
const tx = (referencia, status, extra = {}) => ({
  id: `prueba-${crypto.randomBytes(4).toString('hex')}`, reference: referencia, status,
  amount_in_cents: 80000000, currency: 'COP', payment_method_type: 'CARD', status_message: null, ...extra
});
const transaccionesWompi = {};
global.fetch = async (url) => {
  const id = decodeURIComponent(String(url).split('/transactions/')[1] || '');
  const t = transaccionesWompi[id];
  return { ok: Boolean(t), status: t ? 200 : 404, json: async () => (t ? { data: t } : {}) };
};

const ids = { e1: crypto.randomUUID(), e2: crypto.randomUUID(), e3: crypto.randomUUID(), prop: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;
let admin, prop;

async function crearUsuario(id, rol, nombre) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-acu-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}
const pagoDeSol = async (id) => (await db.query('SELECT * FROM pagos WHERE solicitud_id = $1 ORDER BY id DESC LIMIT 1', [id])).rows[0];
const pago = async (id) => (await db.query('SELECT * FROM pagos WHERE id = $1', [id])).rows[0];
async function ver(codigo) { const r = res(); await ac.verEnlace(req(null, { params: { codigo } }), r); return r.cuerpo.data; }

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
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision, version_condiciones, acepta_comision_en)
      VALUES ($1, 'aprobado', 'Carlos Prueba Rodríguez', true, '2026-11', now())`, [ids.prop]);
    admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba acudiente', 'habitacion', 'Habitación', 800000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;
    const p1 = await pagoDeSol(await hastaFormalizado(e1, 'Laura Prueba Gómez'));
    ok(p1 && p1.estado === 'pendiente', `Pago #${p1.id} habilitado con el contrato formalizado`);

    // 1. Crear el enlace
    let e = await falla(() => ac.crearEnlace(req(e2, { params: { id: p1.id } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede crear un enlace para este pago → 404');
    let r = res(); await ac.crearEnlace(req(e1, { params: { id: p1.id } }), r);
    const codigo1 = codigoDe(r.cuerpo.data.url);
    const horas = (new Date(r.cuerpo.data.expiraEn) - Date.now()) / 3600e3;
    ok(/\/pages\/pagar\.html\?c=/.test(r.cuerpo.data.url) && codigo1.length >= 43 && horas > 23.9 && horas <= 24,
      `Enlace creado: código de ${codigo1.length} caracteres que vence en 24 horas`);
    const guardado = (await db.query('SELECT token_huella FROM pagos_enlaces WHERE pago_id = $1', [p1.id])).rows[0];
    ok(guardado.token_huella === sha(codigo1) && !JSON.stringify(guardado).includes(codigo1), 'En la base de datos solo queda la huella SHA-256, nunca el código');
    r = res(); await pg.verPago(req(e1, { params: { id: p1.id } }), r);
    ok(r.cuerpo.data.enlace && r.cuerpo.data.enlace.expiraEn && !JSON.stringify(r.cuerpo.data).includes(codigo1),
      'El estudiante ve que tiene un enlace activo y cuándo vence (sin el código)');

    // 2. Lo que ve el acudiente (página pública)
    let d = await ver(codigo1);
    const json = JSON.stringify(d);
    ok(d.estado === 'listo' && d.estudiante === 'Laura' && d.monto === 800000 && d.modo === 'sandbox',
      'El acudiente ve: estado "listo", primer nombre del estudiante, monto y modo de pruebas');
    ok(!/@|direcci|telefono|Rodríguez|Gómez|propietario/i.test(json), 'No ve correos, direcciones, teléfonos, apellidos ni datos del propietario');
    e = await falla(() => ver('codigo-que-no-existe-0000000000000000000000000'));
    ok(e && e.status === 404, 'Un código inventado → 404');

    // 3. Un enlace nuevo anula el anterior
    r = res(); await ac.crearEnlace(req(e1, { params: { id: p1.id } }), r);
    const codigo2 = codigoDe(r.cuerpo.data.url);
    ok((await ver(codigo1)).estado === 'anulado' && (await ver(codigo2)).estado === 'listo', 'Al crear un enlace nuevo, el anterior deja de servir');

    // 4. El acudiente abre la pasarela
    e = await falla(() => ac.iniciarEnlace(req(null, { params: { codigo: codigo2 }, body: { nombre: 'Al', correo: 'x' } }), res()));
    ok(e && e.status === 400, 'Nombre o correo inválidos → 400');
    e = await falla(() => ac.iniciarEnlace(req(null, { params: { codigo: codigo1 }, body: { nombre: 'Rosa Gómez', correo: 'rosa@correo.co' } }), res()));
    ok(e && e.status === 410, 'Con el enlace anulado no se puede pagar → 410');
    r = res(); await ac.iniciarEnlace(req(null, { params: { codigo: codigo2 }, body: { nombre: 'Rosa Gómez', correo: 'rosa@correo.co' } }), r);
    const dA = r.cuerpo.data;
    const intento = (await db.query('SELECT * FROM pagos_intentos_wompi WHERE referencia = $1', [dA.referencia])).rows[0];
    ok(dA.montoCentavos === 80000000 && dA.firmaIntegridad === sha(`${dA.referencia}80000000COPtest_integrity_roumixprueba`) && dA.urlRetorno.endsWith(`pagar.html?c=${codigo2}`),
      'Intento firmado por el servidor por el monto exacto, con retorno a la página del acudiente');
    ok(intento.origen === 'acudiente' && intento.pagador_nombre === 'Rosa Gómez' && !JSON.stringify(intento).includes('rosa@correo.co'),
      'El intento queda como del acudiente, con su nombre; su correo NO se guarda (solo se le pasa a Wompi)');

    // 5. Una transacción del estudiante no se puede confirmar por el enlace
    r = res(); await wc.iniciar(req(e1, { params: { id: p1.id } }), r);
    const txEstudiante = tx(r.cuerpo.data.referencia, 'DECLINED');
    transaccionesWompi[txEstudiante.id] = txEstudiante;
    e = await falla(() => ac.confirmarEnlace(req(null, { params: { codigo: codigo2 }, body: { transaccionId: txEstudiante.id } }), res()));
    ok(e && e.status === 404, 'El enlace solo confirma transacciones abiertas por el acudiente → 404');

    // 6. El acudiente paga y Roumix lo confirma consultando a Wompi
    const txA = tx(dA.referencia, 'APPROVED', { payment_method_type: 'NEQUI' });
    transaccionesWompi[txA.id] = txA;
    r = res(); await ac.confirmarEnlace(req(null, { params: { codigo: codigo2 }, body: { transaccionId: txA.id } }), r);
    let pg1 = await pago(p1.id);
    ok(r.cuerpo.data.estado === 'aprobado' && pg1.estado === 'aprobado' && pg1.pagado_por === 'acudiente' && pg1.pagador_nombre === 'Rosa Gómez' && pg1.metodo === 'nequi',
      `Pago aprobado por el acudiente: "${r.cuerpo.message}"`);
    const enl = (await db.query('SELECT estado, usado_en FROM pagos_enlaces WHERE pago_id = $1 ORDER BY id', [p1.id])).rows;
    ok(enl[0].estado === 'revocado' && enl[1].estado === 'usado' && enl[1].usado_en, 'El enlace quedó "usado" y no sirve para pagar otra vez');
    d = await ver(codigo2);
    ok(d.estado === 'pagado' && d.referencia === pg1.referencia, 'Al abrirlo de nuevo, el acudiente ve "Este arriendo ya está pagado"');
    const det = (await db.query("SELECT detalle FROM pagos_eventos WHERE pago_id = $1 AND tipo = 'intento_aprobado'", [p1.id])).rows[0].detalle;
    ok(/pagó el acudiente \(Rosa Gómez\)/.test(det), 'El historial del pago dice que pagó el acudiente');

    // 7. Enlace vencido, y pago con PSE que empezó antes de vencer y se confirma después
    const p2 = await pagoDeSol(await hastaFormalizado(e3, 'Sara Prueba'));
    r = res(); await ac.crearEnlace(req(e3, { params: { id: p2.id } }), r);
    const codigo3 = codigoDe(r.cuerpo.data.url);
    r = res(); await ac.iniciarEnlace(req(null, { params: { codigo: codigo3 }, body: { nombre: 'Jorge Prueba', correo: 'jorge@correo.co' } }), r);
    const refPse = r.cuerpo.data.referencia;
    await webhook(evento(tx(refPse, 'PENDING', { payment_method_type: 'PSE' })));
    d = await ver(codigo3);
    ok(d.estado === 'en_proceso', 'Con un PSE en proceso, la página del acudiente avisa y no deja pagar dos veces');
    await db.query("UPDATE pagos_enlaces SET expira_en = now() - interval '1 minute' WHERE pago_id = $1 AND estado = 'activo'", [p2.id]);
    d = await ver(codigo3);
    ok(d.estado === 'vencido' && /venció/.test(d.mensaje), `Pasadas las 24 horas: "${d.mensaje}"`);
    e = await falla(() => ac.iniciarEnlace(req(null, { params: { codigo: codigo3 }, body: { nombre: 'Jorge Prueba', correo: 'jorge@correo.co' } }), res()));
    ok(e && e.status === 410, 'Con el enlace vencido no se puede abrir la pasarela → 410');
    r = await webhook(evento(tx(refPse, 'APPROVED', { payment_method_type: 'PSE' })));
    ok(r.cuerpo.resultado === 'aprobado' && (await pago(p2.id)).pagado_por === 'acudiente',
      'El PSE que empezó antes de vencer el enlace sí se registra al confirmarse (no se pierde el pago)');

    // 8. Anular el enlace
    const s4 = await hastaFormalizado(e2, 'Mateo Prueba');
    const p3 = await pagoDeSol(s4);
    r = res(); await ac.crearEnlace(req(e2, { params: { id: p3.id } }), r);
    const codigo4 = codigoDe(r.cuerpo.data.url);
    r = res(); await ac.anularEnlace(req(e2, { params: { id: p3.id } }), r);
    ok((await ver(codigo4)).estado === 'anulado', 'El estudiante puede anular el enlace');
    e = await falla(() => ac.anularEnlace(req(e2, { params: { id: p3.id } }), res()));
    ok(e && e.status === 409, 'Anular sin enlace activo → 409');

    // 9. Si el estudiante paga él mismo, el enlace del acudiente deja de servir
    r = res(); await ac.crearEnlace(req(e2, { params: { id: p3.id } }), r);
    const codigo5 = codigoDe(r.cuerpo.data.url);
    r = res(); await wc.iniciar(req(e2, { params: { id: p3.id } }), r);
    await webhook(evento(tx(r.cuerpo.data.referencia, 'APPROVED')));
    ok((await ver(codigo5)).estado === 'pagado' && (await pago(p3.id)).pagado_por === 'estudiante',
      'El estudiante pagó él mismo: el enlace queda inservible y la página muestra "ya está pagado"');
    e = await falla(() => ac.crearEnlace(req(e2, { params: { id: p3.id } }), res()));
    ok(e && e.status === 409, 'No se puede crear un enlace para un pago ya hecho → 409');

    // 10. Sin Wompi no hay enlaces
    delete process.env.WOMPI_PUBLIC_KEY;
    e = await falla(() => ac.crearEnlace(req(e1, { params: { id: p1.id } }), res()));
    ok(e && e.status === 503, 'Sin la pasarela activa no se crean enlaces → 503');
    process.env.WOMPI_PUBLIC_KEY = 'pub_test_roumixprueba';
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    const todos = Object.values(ids);
    await db.query('DELETE FROM conversaciones WHERE usuario_id = ANY($1)', [todos]);
    if (inmuebleId) {
      const pagosIds = (await db.query('SELECT p.id FROM pagos p JOIN solicitudes s ON s.id = p.solicitud_id WHERE s.inmueble_id = $1', [inmuebleId])).rows.map((x) => x.id);
      const refs = (await db.query('SELECT referencia FROM pagos_intentos_wompi WHERE pago_id = ANY($1)', [pagosIds])).rows.map((x) => x.referencia);
      await db.query('DELETE FROM wompi_eventos WHERE referencia = ANY($1)', [refs]);
      await db.query('DELETE FROM pagos_intentos_wompi WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM pagos_enlaces WHERE pago_id = ANY($1)', [pagosIds]);
      for (const t of ['devoluciones', 'desembolsos', 'comisiones']) await db.query(`DELETE FROM ${t} WHERE pago_id = ANY($1)`, [pagosIds]);
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
