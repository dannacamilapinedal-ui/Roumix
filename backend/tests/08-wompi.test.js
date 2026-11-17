// Prueba del módulo W-1 (pagos con Wompi) contra la BD real.
// No se conecta a Wompi: usa llaves de prueba inventadas y simula las respuestas de su API
// (fetch) y los eventos de su webhook, firmados con el mismo algoritmo que usa Wompi.
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';
// Llaves FALSAS de pruebas (no existen en Wompi)
process.env.WOMPI_PUBLIC_KEY = 'pub_test_roumixprueba';
process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_roumixprueba';
process.env.WOMPI_EVENTS_SECRET = 'test_events_roumixprueba';
delete process.env.WOMPI_PRIVATE_KEY;

const db = require(path.join(backend, 'src/config/db'));
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
const correos = [];
notificaciones.usarTransporte({ sendMail: async (m) => { correos.push(m); } });
const wompi = require(path.join(backend, 'src/services/wompiService'));
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

// Evento del webhook firmado como lo firma Wompi
let reloj = Math.floor(Date.now() / 1000);
function evento(tx, { secreto = process.env.WOMPI_EVENTS_SECRET, ts = ++reloj, ambiente = 'test' } = {}) {
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = sha(`${tx.id}${tx.status}${tx.amount_in_cents}${ts}${secreto}`);
  return { event: 'transaction.updated', data: { transaction: tx }, environment: ambiente, signature: { properties, checksum }, timestamp: ts, sent_at: new Date().toISOString() };
}
async function webhook(ev, cabecera) {
  const r = res();
  await wc.recibirEvento(req(null, { body: ev, get: (h) => (h === 'X-Event-Checksum' ? cabecera : 'roumix.prueba') }), r);
  return r;
}
const tx = (referencia, status, extra = {}) => ({
  id: `prueba-${crypto.randomBytes(4).toString('hex')}`, reference: referencia, status,
  amount_in_cents: 80000000, currency: 'COP', payment_method_type: 'CARD', status_message: null, ...extra
});

// La API de Wompi simulada: GET /transactions/:id
const transaccionesWompi = {};
global.fetch = async (url) => {
  const id = decodeURIComponent(String(url).split('/transactions/')[1] || '');
  const t = transaccionesWompi[id];
  return { ok: Boolean(t), status: t ? 200 : 404, json: async () => (t ? { data: t } : { error: {} }) };
};

const ids = { e1: crypto.randomUUID(), e2: crypto.randomUUID(), e3: crypto.randomUUID(), prop: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;
let admin, prop;
const referenciasSueltas = [];

async function crearUsuario(id, rol, nombre) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-wompi-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  // Documento de identidad inventado (pasaporte de prueba único): el contrato lo exige para enviarse
  await db.query("INSERT INTO documentos_identidad (usuario_id, tipo, numero, nombre_completo) VALUES ($1, 'PA', $2, $3)",
    [id, 'PRB' + crypto.randomBytes(5).toString('hex').toUpperCase(), `${nombre} Prueba`.split(' ').length > 1 ? `${nombre} Prueba` : nombre]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}
const pagoDeSol = async (id) => (await db.query('SELECT * FROM pagos WHERE solicitud_id = $1 ORDER BY id DESC LIMIT 1', [id])).rows[0];
const pago = async (id) => (await db.query('SELECT * FROM pagos WHERE id = $1', [id])).rows[0];
const eventosDe = async (id) => (await db.query('SELECT tipo FROM pagos_eventos WHERE pago_id = $1 ORDER BY id', [id])).rows.map((x) => x.tipo);

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
  await ct.aceptarContrato(req(est, { params: { id: ctId }, body: { firma: nombre, confirmo: true, codigo: await ct.crearCodigoFirma(ctId, est.id) } }), res());
  await ct.aceptarContrato(req(prop, { params: { id: ctId }, body: { firma: 'Carlos Prueba Rodríguez', confirmo: true, codigo: await ct.crearCodigoFirma(ctId, prop.id) } }), res());
  return solId;
}

(async () => {
  try {
    // 0. Configuración, firma de integridad y verificación de eventos
    const cfg = wompi.config();
    ok(cfg.activo && cfg.modo === 'sandbox', 'Con llaves pub_test_/test_integrity_/test_events_ Wompi queda activo en modo de pruebas');
    ok(wompi.firmaIntegridad({ referencia: 'RMX-1', montoCentavos: 80000000, moneda: 'COP' }) === sha('RMX-180000000COPtest_integrity_roumixprueba'),
      'Firma de integridad = SHA256(referencia + monto en centavos + moneda + secreto)');
    process.env.WOMPI_EVENTS_SECRET = 'prod_events_mezclada';
    ok(!wompi.config().activo && wompi.config().motivo === 'llaves_de_ambientes_distintos', 'Mezclar llaves de pruebas y de producción desactiva Wompi');
    process.env.WOMPI_EVENTS_SECRET = 'test_events_roumixprueba';
    const evPrueba = evento(tx('RMX-X', 'APPROVED'));
    ok(wompi.verificarEvento(evPrueba, evPrueba.signature.checksum), 'Un evento firmado con el secreto correcto se acepta');
    ok(!wompi.verificarEvento(evento(tx('RMX-X', 'APPROVED'), { secreto: 'test_events_otro' })), 'Un evento firmado con otro secreto se rechaza');
    const alterado = evento(tx('RMX-X', 'DECLINED')); alterado.data.transaction.status = 'APPROVED';
    ok(!wompi.verificarEvento(alterado), 'Un evento con el estado alterado después de firmar se rechaza');
    ok(/fondos insuficientes/.test(wompi.mensajeHumano('DECLINED', 'Fondos insuficientes'))
      && /3D Secure/.test(wompi.mensajeHumano('DECLINED', 'Error en autenticación 3DS'))
      && /error técnico/.test(wompi.mensajeHumano('ERROR', 'x'))
      && /rechazó/.test(wompi.mensajeHumano('DECLINED', 'Transacción rechazada por el banco')),
      'Mensajes claros: fondos insuficientes, 3D Secure, error técnico y rechazo del banco');

    // Datos de prueba
    const e1 = await crearUsuario(ids.e1, 'estudiante', 'Laura Prueba');
    const e2 = await crearUsuario(ids.e2, 'estudiante', 'Mateo Prueba');
    const e3 = await crearUsuario(ids.e3, 'estudiante', 'Sara Prueba');
    prop = await crearUsuario(ids.prop, 'propietario', 'Carlos');
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision, version_condiciones, acepta_comision_en)
      VALUES ($1, 'aprobado', 'Carlos Prueba Rodríguez', true, '2026-11', now())`, [ids.prop]);
    admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba Wompi', 'habitacion', 'Habitación', 800000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;

    const s1 = await hastaFormalizado(e1, 'Laura Prueba');
    const p1 = await pagoDeSol(s1);
    ok(p1 && p1.estado === 'pendiente', `Contrato formalizado → pago #${p1 && p1.id} habilitado`);

    // 1. Con Wompi activo, el simulador está cerrado y la página sabe qué pasarela usar
    let e = await falla(() => pg.simularPago(req(e1, { params: { id: p1.id }, body: { metodo: 'pse_simulado', resultado: 'aprobado' } }), res()));
    ok(e && e.status === 409 && /Wompi/.test(e.message), 'Con Wompi activo nadie puede "pagar" con el simulador → 409');
    let r = res(); await pg.verPago(req(e1, { params: { id: p1.id } }), r);
    ok(r.cuerpo.data.pasarela.tipo === 'wompi' && r.cuerpo.data.pasarela.modo === 'sandbox' && !JSON.stringify(r.cuerpo).includes('test_integrity_'),
      'GET /pagos/:id indica "Wompi, modo de pruebas" y nunca expone un secreto');

    // 2. Iniciar el pago
    e = await falla(() => wc.iniciar(req(e2, { params: { id: p1.id } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede abrir la pasarela de este pago → 404');
    r = res(); await wc.iniciar(req(e1, { params: { id: p1.id } }), r);
    const d1 = r.cuerpo.data;
    ok(d1.montoCentavos === 80000000 && d1.moneda === 'COP' && d1.llavePublica === 'pub_test_roumixprueba' && /^RMX-\d+-\d{8}-[0-9A-F]{8}$/.test(d1.referencia),
      `Intento creado: referencia ${d1.referencia}, 80.000.000 centavos (= $800.000), llave pública`);
    ok(d1.firmaIntegridad === sha(`${d1.referencia}80000000COPtest_integrity_roumixprueba`) && /pago\.html\?pago=\d+$/.test(d1.urlRetorno),
      'La firma de integridad la calcula el servidor y la URL de retorno lleva el número del pago');
    ok(!('integridad' in d1) && !JSON.stringify(d1).includes('test_integrity_') && !JSON.stringify(d1).includes('test_events_'), 'La respuesta no incluye el secreto de integridad ni el de eventos');

    // 3. Webhook: firma inválida → 401 y no cambia nada
    const rechazo = tx(d1.referencia, 'DECLINED', { status_message: 'Fondos insuficientes' });
    const falso = evento(rechazo, { secreto: 'test_events_atacante' });
    r = await webhook(falso, falso.signature.checksum);
    ok(r.codigo === 401 && (await pago(p1.id)).estado === 'pendiente', 'Evento con firma falsa → 401 y el pago sigue pendiente');

    // 4. Webhook: rechazo por fondos insuficientes
    const evRechazo = evento(rechazo);
    r = await webhook(evRechazo, evRechazo.signature.checksum);
    let pg1 = await pago(p1.id);
    ok(r.cuerpo.resultado === 'rechazado' && pg1.estado === 'fallido' && pg1.intentos === 1 && /fondos insuficientes/.test(pg1.ultimo_error),
      `Rechazo registrado: "${pg1.ultimo_error}"`);
    r = await webhook(evRechazo, evRechazo.signature.checksum);
    ok(r.cuerpo.resultado === 'duplicado' && (await pago(p1.id)).intentos === 1, 'El mismo evento reenviado por Wompi no se procesa dos veces');

    // 5. Segundo intento: PSE en proceso → no se puede abrir otro
    r = res(); await wc.iniciar(req(e1, { params: { id: p1.id } }), r);
    const d2 = r.cuerpo.data;
    const enProceso = tx(d2.referencia, 'PENDING', { payment_method_type: 'PSE' });
    r = await webhook(evento(enProceso));
    ok(r.cuerpo.resultado === 'en_proceso', 'PSE en proceso registrado');
    e = await falla(() => wc.iniciar(req(e1, { params: { id: p1.id } }), res()));
    ok(e && e.status === 409 && /en proceso/.test(e.message), 'Con un pago en proceso no se puede abrir otro (evita cobrar dos veces) → 409');

    // 6. Confirmación al volver del banco: Roumix CONSULTA a Wompi (no confía en el navegador)
    transaccionesWompi[enProceso.id] = { ...enProceso, status: 'APPROVED' };
    e = await falla(() => wc.confirmar(req(e2, { params: { id: p1.id }, body: { transaccionId: enProceso.id } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede confirmar este pago → 404');
    correos.length = 0;
    r = res(); await wc.confirmar(req(e1, { params: { id: p1.id }, body: { transaccionId: enProceso.id } }), r);
    pg1 = await pago(p1.id);
    ok(r.cuerpo.data.estado === 'aprobado' && pg1.estado === 'aprobado' && pg1.simulado === false && pg1.proveedor === 'wompi'
      && pg1.modo_wompi === 'sandbox' && pg1.metodo === 'pse' && pg1.referencia === d2.referencia && pg1.wompi_transaccion_id === enProceso.id,
      `Pago aprobado con Wompi: real (no simulado), PSE, modo de pruebas, referencia ${pg1.referencia}`);
    const com = (await db.query('SELECT monto, estado FROM comisiones WHERE pago_id = $1', [p1.id])).rows;
    const des = (await db.query('SELECT monto, estado FROM desembolsos WHERE pago_id = $1', [p1.id])).rows;
    ok(com.length === 1 && com[0].monto === 80000 && des.length === 1 && des[0].monto === 720000 && des[0].estado === 'pendiente',
      'Comisión del 10 % (80.000) registrada y desembolso de 720.000 pendiente');
    ok((await db.query('SELECT estado FROM solicitudes WHERE id = $1', [s1])).rows[0].estado === 'pagado', 'La solicitud pasó a "Pagado"');
    await new Promise((x) => setTimeout(x, 300));
    ok(correos.some((c) => /Pago confirmado/.test(c.subject)) && !correos.some((c) => /\(simulado\)/.test(c.html)) && correos.some((c) => /modo de pruebas/.test(c.html)),
      'Correos enviados sin "(simulado)" y con la nota "Wompi en modo de pruebas"');

    // 7. El webhook del mismo resultado llega después: no se aprueba dos veces
    r = await webhook(evento({ ...enProceso, status: 'APPROVED' }));
    ok(r.cuerpo.resultado === 'sin_cambios' && (await db.query('SELECT count(*)::int n FROM comisiones WHERE pago_id = $1', [p1.id])).rows[0].n === 1,
      'El webhook posterior no duplica la aprobación ni la comisión (idempotente)');
    r = await webhook(evento({ ...enProceso, status: 'PENDING' }));
    ok(r.cuerpo.resultado === 'sin_cambios' && (await pago(p1.id)).estado === 'aprobado', 'Un "en proceso" tardío no devuelve un pago aprobado a pendiente');

    // 8. Doble cobro: un intento viejo se aprueba cuando el pago ya estaba aprobado → por devolver
    const refVieja = `RMX-${p1.id}-20261115-DOBLE${sello % 1000}`;
    await db.query(`INSERT INTO pagos_intentos_wompi (pago_id, referencia, monto_centavos, modo) VALUES ($1, $2, 80000000, 'sandbox')`, [p1.id, refVieja]);
    correos.length = 0;
    r = await webhook(evento(tx(refVieja, 'APPROVED')));
    await new Promise((x) => setTimeout(x, 300));
    ok(r.cuerpo.resultado === 'requiere_devolucion' && (await eventosDe(p1.id)).includes('requiere_devolucion')
      && correos.some((c) => /cobro de más/i.test(c.subject)), 'Cobro duplicado → queda marcado "por devolver" y se avisa al equipo');

    // 9. Monto distinto al firmado → no se aprueba
    const s2 = await hastaFormalizado(e3, 'Sara Prueba');
    const p2 = await pagoDeSol(s2);
    r = res(); await wc.iniciar(req(e3, { params: { id: p2.id } }), r);
    r = await webhook(evento(tx(r.cuerpo.data.referencia, 'APPROVED', { amount_in_cents: 100 })));
    ok(r.cuerpo.resultado === 'monto_no_coincide' && (await pago(p2.id)).estado === 'pendiente',
      'Una transacción por un monto distinto al firmado NO aprueba el pago');

    // 10. Una transacción de otro pago no se puede usar para confirmar este
    e = await falla(() => wc.confirmar(req(e3, { params: { id: p2.id }, body: { transaccionId: enProceso.id } }), res()));
    ok(e && e.status === 404 && /no corresponde/.test(e.message), 'No se puede confirmar con una transacción de otro pago → 404');

    // 11. Pago cancelado por el equipo y luego aprobado en Wompi → por devolver, la solicitud no revive
    r = res(); await wc.iniciar(req(e3, { params: { id: p2.id } }), r);
    const refTarde = r.cuerpo.data.referencia;
    await pg.cancelarAdmin(req(admin, { params: { id: p2.id }, body: { motivo: 'El estudiante desistió del arriendo.' } }), res());
    r = await webhook(evento(tx(refTarde, 'APPROVED')));
    ok(r.cuerpo.resultado === 'requiere_devolucion' && (await pago(p2.id)).estado === 'cancelado',
      'Pago cancelado que luego se aprueba en Wompi → queda "por devolver" y el pago sigue cancelado');

    // 12. Referencia desconocida y ambiente distinto: se responde 200 sin tocar nada
    const refAjena = `OTRA-${sello}`; referenciasSueltas.push(refAjena);
    r = await webhook(evento(tx(refAjena, 'APPROVED')));
    ok(r.codigo === 200 && r.cuerpo.resultado === 'referencia_desconocida', 'Referencia que no es de Roumix → 200 "referencia_desconocida" (Wompi no reintenta)');
    r = await webhook(evento(tx(refAjena, 'DECLINED'), { ambiente: 'prod' }));
    ok(r.cuerpo.resultado === 'ambiente_distinto', 'Un evento de producción con Roumix en modo de pruebas se ignora');

    // 13. Sin llaves, todo vuelve al simulador
    delete process.env.WOMPI_PUBLIC_KEY;
    e = await falla(() => wc.iniciar(req(e3, { params: { id: p2.id } }), res()));
    r = res(); await wc.recibirEvento(req(null, { body: evento(tx('X', 'APPROVED')) }), r);
    ok(e && e.status === 503 && r.codigo === 503, 'Sin llaves de Wompi: la pasarela y el webhook responden 503 (y el simulador vuelve a funcionar)');
    process.env.WOMPI_PUBLIC_KEY = 'pub_test_roumixprueba';
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    const todos = Object.values(ids);
    await db.query('DELETE FROM conversaciones WHERE usuario_id = ANY($1)', [todos]);
    if (inmuebleId) {
      const pagosIds = (await db.query('SELECT p.id FROM pagos p JOIN solicitudes s ON s.id = p.solicitud_id WHERE s.inmueble_id = $1', [inmuebleId])).rows.map((x) => x.id);
      const refs = (await db.query('SELECT referencia FROM pagos_intentos_wompi WHERE pago_id = ANY($1)', [pagosIds])).rows.map((x) => x.referencia);
      await db.query('DELETE FROM wompi_eventos WHERE referencia = ANY($1)', [[...refs, ...referenciasSueltas]]);
      await db.query('DELETE FROM pagos_intentos_wompi WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM devoluciones WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM desembolsos WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM comisiones WHERE pago_id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM pagos WHERE id = ANY($1)', [pagosIds]);
      await db.query('DELETE FROM firmas_codigos WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
      await db.query('DELETE FROM contratos_documentos WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
      await db.query('DELETE FROM contratos WHERE inmueble_id = $1', [inmuebleId]);
      await db.query('DELETE FROM solicitudes WHERE inmueble_id = $1', [inmuebleId]);
      await db.query('DELETE FROM inmuebles WHERE id = $1', [inmuebleId]);
    }
    await db.query("DELETE FROM wompi_eventos WHERE referencia LIKE 'RMX-X%' OR referencia = 'X'").catch(() => {});
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
