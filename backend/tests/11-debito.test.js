// Prueba del módulo W-5b (débito automático mensual) contra la BD real.
// Simula la API de Wompi (aceptación, fuentes de pago y transacciones) y su webhook.
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';
process.env.WOMPI_PUBLIC_KEY = 'pub_test_roumixprueba';
process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_roumixprueba';
process.env.WOMPI_EVENTS_SECRET = 'test_events_roumixprueba';
process.env.WOMPI_PRIVATE_KEY = 'prv_test_roumixprueba';

const db = require(path.join(backend, 'src/config/db'));
const { firmaPrueba, borrarFirmasDePrueba } = require('./_firma');
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
const correos = [];
notificaciones.usarTransporte({ sendMail: async (m) => { correos.push(m); } });
const deb = require(path.join(backend, 'src/controllers/debitoController'));
const wc = require(path.join(backend, 'src/controllers/wompiController'));
const pg = require(path.join(backend, 'src/controllers/pagosController'));
const ct = require(path.join(backend, 'src/controllers/contratosController'));
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));
const propCtrl = require(path.join(backend, 'src/controllers/propietarioController'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, ip: '127.0.0.1', protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const hoy = deb.hoyBogota();
const sumarDias = (iso, d) => { const [a, m, dd] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, dd + d)).toISOString().slice(0, 10); };

// ---------- Wompi simulado ----------
const llamadas = [];
let respuestaCobro = 'APPROVED';           // lo que responde Wompi al cobrar
let reloj = Math.floor(Date.now() / 1000);
global.fetch = async (url, opciones = {}) => {
  const u = String(url);
  const metodo = opciones.method || 'GET';
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
  llamadas.push({ u, metodo, cuerpo, auth: (opciones.headers || {}).Authorization });
  const responder = (data, status = 200) => ({ ok: status < 400, status, json: async () => (status < 400 ? { data } : { error: data }) });
  if (u.endsWith('/merchants/info')) {
    return responder({ presigned_acceptance: { acceptance_token: 'acept-123', permalink: 'https://wompi.co/terminos.pdf' },
      presigned_personal_data_auth: { acceptance_token: 'datos-456', permalink: 'https://wompi.co/datos.pdf' } });
  }
  if (u.endsWith('/payment_sources') && metodo === 'POST') {
    return responder({ id: 98765, status: 'AVAILABLE', public_data: { type: 'CARD', last_four: '4242', brand: 'VISA' } });
  }
  if (u.endsWith('/transactions') && metodo === 'POST') {
    if (respuestaCobro === 'RECHAZO_API') return responder({ reason: 'payment_source_id inválido' }, 422);
    return responder({ id: `tx-${crypto.randomBytes(3).toString('hex')}`, reference: cuerpo.reference, status: respuestaCobro,
      amount_in_cents: cuerpo.amount_in_cents, currency: 'COP', status_message: respuestaCobro === 'DECLINED' ? 'Fondos insuficientes' : null, payment_method_type: 'CARD' });
  }
  return responder({}, 404);
};
function evento(tx) {
  const ts = ++reloj;
  const checksum = sha(`${tx.id}${tx.status}${tx.amount_in_cents}${ts}${process.env.WOMPI_EVENTS_SECRET}`);
  return { event: 'transaction.updated', data: { transaction: tx }, environment: 'test', signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum }, timestamp: ts };
}

const ids = { e1: crypto.randomUUID(), e2: crypto.randomUUID(), prop: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;
let admin, prop;
async function crearUsuario(id, rol, nombre) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-deb-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  // Documento de identidad inventado (pasaporte de prueba único): el contrato lo exige para enviarse
  await db.query("INSERT INTO documentos_identidad (usuario_id, tipo, numero, nombre_completo) VALUES ($1, 'PA', $2, $3)",
    [id, 'PRB' + crypto.randomBytes(5).toString('hex').toUpperCase(), `${nombre} Prueba`.split(' ').length > 1 ? `${nombre} Prueba` : nombre]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}
const pagoDeSol = async (id) => (await db.query('SELECT * FROM pagos WHERE solicitud_id = $1 ORDER BY id DESC LIMIT 1', [id])).rows[0];
const cobrosDe = async (contratoId) => (await db.query(
  "SELECT *, to_char(fecha_cobro, 'YYYY-MM-DD') AS f, to_char(proximo_intento, 'YYYY-MM-DD') AS px FROM cobros_mensuales WHERE contrato_id = $1 ORDER BY numero_mes, id", [contratoId])).rows;

async function hastaPrimerMesPagado(est, nombre, inicio) {
  await db.query("UPDATE inmuebles SET estado = 'disponible' WHERE id = $1", [inmuebleId]);
  let r = res(); await sol.crearSolicitud(req(est, { body: { inmuebleId, fechaIngreso: inicio, duracionMeses: 4, personas: 1 } }), r);
  const solId = r.cuerpo.data.id;
  for (const estado of ['en_revision', 'aceptada', 'en_negociacion', 'contrato_pendiente']) await sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado } }), res());
  r = res(); await ct.crearBorrador(req(admin, { params: { id: solId }, body: { canonMensual: 800000, fechaInicio: inicio, duracionMeses: 4, diaPago: 5 } }), r);
  const ctId = r.cuerpo.data.id;
  await ct.enviarContrato(req(admin, { params: { id: ctId } }), res());
  await ct.aceptarContrato(req(est, { params: { id: ctId }, body: { firma: nombre, confirmo: true, firmaImagen: firmaPrueba, codigo: await ct.crearCodigoFirma(ctId, est.id) } }), res());
  await ct.aceptarContrato(req(prop, { params: { id: ctId }, body: { firma: 'Carlos Prueba Rodríguez', confirmo: true, firmaImagen: firmaPrueba, codigo: await ct.crearCodigoFirma(ctId, prop.id) } }), res());
  const p = await pagoDeSol(solId);
  // Primer mes pagado con Wompi (widget)
  r = res(); await wc.iniciar(req(est, { params: { id: p.id } }), r);
  await wc.recibirEvento(req(null, { body: evento({ id: `tx-${sello}-${p.id}`, reference: r.cuerpo.data.referencia, status: 'APPROVED', amount_in_cents: 80000000, currency: 'COP', payment_method_type: 'CARD' }), get: () => undefined }), res());
  return (await db.query('SELECT * FROM pagos WHERE id = $1', [p.id])).rows[0];
}

(async () => {
  try {
    const e1 = await crearUsuario(ids.e1, 'estudiante', 'Laura Prueba');
    const e2 = await crearUsuario(ids.e2, 'estudiante', 'Mateo Prueba');
    prop = await crearUsuario(ids.prop, 'propietario', 'Carlos');
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision, version_condiciones, acepta_comision_en)
      VALUES ($1, 'aprobado', 'Carlos Prueba Rodríguez', true, '2026-11', now())`, [ids.prop]);
    admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba débito', 'habitacion', 'Habitación', 800000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;

    // 0. Plan de cobros (función pura)
    const plan = deb.calcularPlan({ inicio: '2026-12-20', duracion_meses: 4, dia_pago: 5, canon_mensual: 800000 }, '2026-12-01');
    ok(plan.length === 3 && plan[0].numeroMes === 2 && plan[0].periodoInicio === '2027-01-20' && plan[0].fechaCobro === '2027-02-05'
      && plan[2].periodoInicio === '2027-03-20' && plan[2].fechaCobro === '2027-04-05' && plan[0].comision === 40000 && plan[0].neto === 760000,
      'Plan: meses 2 a 4, cobro el primer día 5 DENTRO de cada periodo (nunca antes), 5 % = 40.000 y 95 % = 760.000');
    const mismoMes = deb.calcularPlan({ inicio: '2026-12-03', duracion_meses: 2, dia_pago: 5, canon_mensual: 800000 }, '2026-12-01');
    ok(mismoMes[0].periodoInicio === '2027-01-03' && mismoMes[0].fechaCobro === '2027-01-05', 'Si el día de pago cae poco después del inicio del periodo, se cobra ese mismo mes');
    const finDeMes = deb.calcularPlan({ inicio: '2027-01-31', duracion_meses: 2, dia_pago: 28, canon_mensual: 800000 }, '2027-01-01')[0];
    ok(finDeMes.periodoInicio === '2027-02-28' && finDeMes.fechaCobro === '2027-02-28',
      'Fin de mes: contrato desde el 31 de enero → el mes 2 empieza el 28 de febrero (no el 3 de marzo) y se cobra ese día');
    const tarde = deb.calcularPlan({ inicio: '2026-10-20', duracion_meses: 4, dia_pago: 5, canon_mensual: 800000 }, '2026-12-10');
    ok(tarde[0].numeroMes === 2 && tarde[0].fechaCobro === '2026-12-11' && !tarde.some((m) => m.numeroMes === 1),
      'Activado tarde: el mes que sigue vigente se cobra mañana y los meses ya terminados no se cobran');

    const inicio = sumarDias(hoy, 10);
    const p1 = await hastaPrimerMesPagado(e1, 'Laura Prueba', inicio);
    ok(p1.estado === 'aprobado', `Primer mes pagado (pago #${p1.id}); contrato de 4 meses`);

    // 1. El propietario aún tiene la versión 2026-11
    let r = res(); await pg.verPago(req(e1, { params: { id: p1.id } }), r);
    let d = r.cuerpo.data.debito;
    ok(d.disponible === false && d.motivo === 'propietario' && d.plan.length === 3 && d.plan[0].comision === undefined,
      'Sin las condiciones 2026-12 del propietario: no disponible; el estudiante ve el plan sin la comisión');
    let e = await falla(() => deb.preparar(req(e1, { params: { id: p1.id } }), res()));
    ok(e && e.status === 409 && /condiciones nuevas/.test(e.message), 'Preparar → 409 hasta que el propietario acepte');
    await propCtrl.aceptarCondiciones(req(prop, { body: { acepto: true } }), res());

    // 2. Preparar y activar
    e = await falla(() => deb.preparar(req(e2, { params: { id: p1.id } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede ver los datos del débito → 404');
    r = res(); await deb.preparar(req(e1, { params: { id: p1.id } }), r);
    const prep = r.cuerpo.data;
    ok(prep.aceptacion.token === 'acept-123' && prep.datosPersonales.enlace && prep.llavePublica === 'pub_test_roumixprueba'
      && prep.apiWompi === 'https://sandbox.wompi.co/v1' && !JSON.stringify(prep).includes('prv_test'),
      'Preparar entrega términos y datos personales de Wompi, la llave pública y la API; nunca la privada');
    e = await falla(() => deb.activar(req(e1, { params: { id: p1.id }, body: { tipo: 'CARD', token: 'tok_test_1234567', aceptacion: 'acept-123' } }), res()));
    ok(e && e.status === 400, 'Sin aceptar los términos → 400');
    llamadas.length = 0;
    r = res(); await deb.activar(req(e1, { params: { id: p1.id }, body: { tipo: 'CARD', token: 'tok_test_1234567', aceptacion: 'acept-123', datosPersonales: 'datos-456', acepto: true } }), r);
    const fuente = llamadas.find((l) => l.u.endsWith('/payment_sources'));
    ok(fuente && fuente.auth === 'Bearer prv_test_roumixprueba' && fuente.cuerpo.type === 'CARD' && fuente.cuerpo.acceptance_token === 'acept-123'
      && fuente.cuerpo.accept_personal_auth === 'datos-456' && fuente.cuerpo.customer_email === e1.email,
      'La fuente de pago se crea en el servidor con la llave privada, los dos tokens de aceptación y el correo del estudiante');
    const dbt = (await db.query('SELECT * FROM debitos_automaticos WHERE pago_id = $1', [p1.id])).rows[0];
    let cobros = await cobrosDe(p1.contrato_id);
    ok(dbt.estado === 'activo' && dbt.fuente_wompi_id === '98765' && dbt.fuente_descripcion === 'VISA •••• 4242' && dbt.version_condiciones === '2026-12',
      `Débito activo con "${dbt.fuente_descripcion}"; Roumix guarda solo el id de la fuente`);
    ok(cobros.length === 3 && cobros.every((c) => c.estado === 'programado' && c.comision === 40000 && c.neto_propietario === 760000),
      `${r.cuerpo.message} → 3 cobros programados (meses 2, 3 y 4)`);
    e = await falla(() => deb.activar(req(e1, { params: { id: p1.id }, body: { tipo: 'CARD', token: 'tok_test_1234567', aceptacion: 'acept-123', acepto: true } }), res()));
    ok(e && e.status === 409, 'No se puede activar dos veces');

    // 3. El día de cobro: la tarea diaria cobra con la fuente guardada
    const [c2, c3, c4] = cobros;
    await db.query('UPDATE cobros_mensuales SET fecha_cobro = $2, proximo_intento = $2 WHERE id = $1', [c2.id, hoy]);
    llamadas.length = 0; correos.length = 0;
    let res1 = await deb.procesarCobros();
    const cobro = llamadas.find((l) => l.u.endsWith('/transactions'));
    ok(cobro && cobro.auth === 'Bearer prv_test_roumixprueba' && cobro.cuerpo.payment_source_id === 98765 && cobro.cuerpo.recurrent === true
      && cobro.cuerpo.amount_in_cents === 80000000 && cobro.cuerpo.signature === sha(`${cobro.cuerpo.reference}80000000COPtest_integrity_roumixprueba`)
      && /^RMXM-\d+-\d{8}-[0-9A-F]{8}$/.test(cobro.cuerpo.reference),
      'Cobro con la llave privada, la fuente guardada, recurrent: true y la firma de integridad');
    cobros = await cobrosDe(p1.contrato_id);
    ok(res1.aprobados === 1 && cobros[0].estado === 'aprobado' && cobros[0].desembolso_estado === 'pendiente' && cobros[1].estado === 'programado',
      'Mes 2 aprobado: desembolso del 95 % pendiente; el mes 3 sigue programado para su fecha');
    await new Promise((x) => setTimeout(x, 300));
    ok(correos.some((c) => /Cobramos el mes 2/.test(c.subject)) && correos.some((c) => /Recibimos el mes 2/.test(c.subject) && /760\.000/.test(c.html)),
      'Correos al estudiante (cobro) y al propietario (su desembolso de $760.000)');
    res1 = await deb.procesarCobros();
    ok(res1.procesados === 0, 'Si la tarea corre otra vez el mismo día, no vuelve a cobrar');

    // 4. El webhook del mismo cobro llega después: no cambia nada
    const tx2 = { id: cobros[0].wompi_transaccion_id, reference: cobros[0].referencia, status: 'APPROVED', amount_in_cents: 80000000, currency: 'COP' };
    r = res(); await wc.recibirEvento(req(null, { body: evento(tx2), get: () => undefined }), r);
    ok(r.cuerpo.resultado === 'sin_cambios', 'El webhook del cobro ya aplicado no lo duplica');

    // 5. Fallos: 3 intentos en 3 días y luego "vencido"
    respuestaCobro = 'DECLINED';
    await db.query('UPDATE cobros_mensuales SET fecha_cobro = $2, proximo_intento = $2 WHERE id = $1', [c3.id, hoy]);
    correos.length = 0;
    await deb.procesarCobros();
    let c3b = (await cobrosDe(p1.contrato_id)).find((c) => c.id === c3.id);
    ok(c3b.estado === 'fallido' && c3b.intentos === 1 && c3b.px === sumarDias(hoy, 1) && /fondos insuficientes/.test(c3b.ultimo_error),
      `1.er fallo: "${c3b.ultimo_error}" → reintento mañana`);
    await db.query('UPDATE cobros_mensuales SET proximo_intento = $2 WHERE id = $1', [c3.id, hoy]);
    await deb.procesarCobros();
    c3b = (await cobrosDe(p1.contrato_id)).find((c) => c.id === c3.id);
    ok(c3b.estado === 'fallido' && c3b.intentos === 2 && c3b.px === sumarDias(hoy, 2), '2.º fallo → reintento en 2 días');
    respuestaCobro = 'RECHAZO_API';
    await db.query('UPDATE cobros_mensuales SET proximo_intento = $2 WHERE id = $1', [c3.id, hoy]);
    await deb.procesarCobros();
    c3b = (await cobrosDe(p1.contrato_id)).find((c) => c.id === c3.id);
    ok(c3b.estado === 'vencido' && c3b.intentos === 3 && c3b.px === null, '3.er fallo (aunque sea un rechazo de la API) → "vencido", sin más reintentos automáticos');
    await new Promise((x) => setTimeout(x, 300));
    ok(correos.some((c) => /No pudimos cobrar el mes 3/.test(c.subject) && /no cobra recargos/i.test(c.html)) && correos.some((c) => /Cobro mensual vencido/.test(c.subject)),
      'Al estudiante se le avisa cada fallo (sin recargos de Roumix) y al equipo cuando queda vencido');
    const monto = (await db.query('SELECT monto FROM cobros_mensuales WHERE id = $1', [c3.id])).rows[0].monto;
    ok(monto === 800000, 'El monto del mes atrasado no cambia: Roumix no suma recargos');

    // 6. Lo que ve cada parte
    r = res(); await pg.verPago(req(e1, { params: { id: p1.id } }), r);
    d = r.cuerpo.data.debito;
    ok(d.activo && d.activo.descripcion === 'VISA •••• 4242' && d.cobros.length === 3 && d.cobros[0].comision === undefined,
      'El estudiante ve su débito y sus cobros, sin la comisión');
    r = res(); await pg.verPago(req(prop, { params: { id: p1.id } }), r);
    ok(r.cuerpo.data.debito.cobros[0].neto_propietario === 760000, 'El propietario ve su desembolso de cada mes');

    // 7. Desembolso del panel
    e = await falla(() => deb.desembolsoAdmin(req(admin, { params: { id: c3.id } }), res()));
    ok(e && e.status === 409, 'No se desembolsa un cobro que no se aprobó');
    r = res(); await deb.desembolsoAdmin(req(admin, { params: { id: c2.id } }), r);
    ok((await cobrosDe(p1.contrato_id))[0].desembolso_estado === 'realizado', `${r.cuerpo.message}`);
    r = res(); await deb.listarAdmin(req(admin, { query: { estado: 'problemas' } }), r);
    ok(r.cuerpo.habilitado && r.cuerpo.data.some((c) => c.id === c3.id), 'El panel lista el cobro vencido en "Problemas"');

    // 8. Desactivar
    r = res(); await deb.desactivar(req(e1, { params: { id: p1.id } }), r);
    cobros = await cobrosDe(p1.contrato_id);
    ok(cobros.find((c) => c.id === c4.id).estado === 'cancelado' && cobros.find((c) => c.id === c2.id).estado === 'aprobado',
      'Al desactivar se cancelan los cobros futuros; los ya cobrados no cambian');
    respuestaCobro = 'APPROVED';
    await db.query('UPDATE cobros_mensuales SET proximo_intento = $2, fecha_cobro = $2 WHERE id = $1', [c4.id, hoy]);
    res1 = await deb.procesarCobros();
    ok(res1.procesados === 0, 'Con el débito desactivado, la tarea diaria no cobra nada');
    e = await falla(() => deb.desactivar(req(e1, { params: { id: p1.id } }), res()));
    ok(e && e.status === 409, 'Desactivar dos veces → 409');

    // 9. Sin llave privada no hay débito
    delete process.env.WOMPI_PRIVATE_KEY;
    e = await falla(() => deb.preparar(req(e1, { params: { id: p1.id } }), res()));
    r = res(); await pg.verPago(req(e1, { params: { id: p1.id } }), r);
    ok(e && e.status === 503 && r.cuerpo.data.debito.motivo === 'pasarela' && (await deb.procesarCobros()).omitido === 'falta_llave_privada',
      'Sin WOMPI_PRIVATE_KEY: no se activa ni se cobra, y la página lo indica');
    process.env.WOMPI_PRIVATE_KEY = 'prv_test_roumixprueba';
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    const todos = Object.values(ids);
    await db.query('DELETE FROM conversaciones WHERE usuario_id = ANY($1)', [todos]);
    if (inmuebleId) {
      const pagosIds = (await db.query('SELECT p.id FROM pagos p JOIN solicitudes s ON s.id = p.solicitud_id WHERE s.inmueble_id = $1', [inmuebleId])).rows.map((x) => x.id);
      const debIds = (await db.query('SELECT id FROM debitos_automaticos WHERE pago_id = ANY($1)', [pagosIds])).rows.map((x) => x.id);
      const cobIds = (await db.query('SELECT id FROM cobros_mensuales WHERE debito_id = ANY($1)', [debIds])).rows.map((x) => x.id);
      const refs = [
        ...(await db.query('SELECT referencia FROM pagos_intentos_wompi WHERE pago_id = ANY($1)', [pagosIds])).rows,
        ...(await db.query('SELECT referencia FROM cobros_intentos WHERE cobro_id = ANY($1)', [cobIds])).rows
      ].map((x) => x.referencia);
      await db.query('DELETE FROM wompi_eventos WHERE referencia = ANY($1)', [refs]);
      await db.query('DELETE FROM cobros_intentos WHERE cobro_id = ANY($1)', [cobIds]);
      await db.query('DELETE FROM cobros_mensuales WHERE id = ANY($1)', [cobIds]);
      await db.query('DELETE FROM debitos_automaticos WHERE id = ANY($1)', [debIds]);
      await db.query('DELETE FROM pagos_intentos_wompi WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM pagos_enlaces WHERE pago_id = ANY($1)', [pagosIds]);
      for (const t of ['devoluciones', 'desembolsos', 'comisiones']) await db.query(`DELETE FROM ${t} WHERE pago_id = ANY($1)`, [pagosIds]);
      await db.query('DELETE FROM pagos WHERE id = ANY($1)', [pagosIds]);
      await borrarFirmasDePrueba(db, inmuebleId);
      await db.query('DELETE FROM firmas_codigos WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
      await db.query('DELETE FROM contratos_documentos WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
      await db.query('DELETE FROM contratos WHERE inmueble_id = $1', [inmuebleId]);
      await db.query('DELETE FROM solicitudes WHERE inmueble_id = $1', [inmuebleId]);
      await db.query('DELETE FROM inmuebles WHERE id = $1', [inmuebleId]);
    }
    await db.query('DELETE FROM condiciones_avisos WHERE propietario_id = ANY($1)', [todos]).catch(() => {});
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
