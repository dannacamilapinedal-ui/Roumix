// Prueba del módulo F-1 (documento de identidad de las partes y contrato en PDF sellado).
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';

const db = require(path.join(backend, 'src/config/db'));
const { firmaPrueba, borrarFirmasDePrueba } = require('./_firma');
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
notificaciones.usarTransporte({ sendMail: async () => {} });
const ident = require(path.join(backend, 'src/controllers/identidadController'));
const ct = require(path.join(backend, 'src/controllers/contratosController'));
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));
const msg = require(path.join(backend, 'src/controllers/mensajesController'));
const { PLANTILLA } = require(path.join(backend, 'src/services/contratoPdfService'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => {
  const r = { codigo: 200, cabeceras: {} };
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (j) => { r.cuerpo = j; return r; };
  r.set = (h) => { Object.assign(r.cabeceras, h); return r; };
  r.send = (b) => { r.binario = b; return r; };
  return r;
};
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, ip: '127.0.0.1', protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enDias = (d) => new Date(Date.now() - 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// Texto que dibuja pdf-lib: se descomprimen los flujos y se leen las cadenas hexadecimales (WinAnsi)
const zlib = require('zlib');
function textoPdf(b) {
  const crudo = b.toString('latin1');
  let contenido = crudo;
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { contenido += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch (e) { /* flujo sin comprimir */ }
  }
  return [...contenido.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('\n');
}

const ids = { est: crypto.randomUUID(), prop: crypto.randomUUID(), otro: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;
const numeroCC = String(9000000000 + (sello % 99999999)).slice(0, 10);

async function crearUsuario(id, rol, nombre) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-pdf-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}

(async () => {
  try {
    const est = await crearUsuario(ids.est, 'estudiante', 'Laura');
    const prop = await crearUsuario(ids.prop, 'propietario', 'Carlos');
    const otro = await crearUsuario(ids.otro, 'estudiante', 'Mateo');
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision, version_condiciones, acepta_comision_en)
      VALUES ($1, 'aprobado', 'Carlos Prueba', true, '2026-12', now())`, [ids.prop]);
    const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba PDF', 'habitacion', 'Habitación', 650000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;

    // 1. Documento de identidad
    let r = res(); await ident.ver(req(est), r);
    ok(r.cuerpo.data.registrado === false, 'Sin documento registrado al inicio');
    let e = await falla(() => ident.guardar(req(est, { body: { tipo: 'CC', numero: '12', nombreCompleto: 'Laura Gómez' } }), res()));
    ok(e && e.status === 400 && /5 y 10 dígitos/.test(e.message), 'Cédula con muy pocos dígitos → 400');
    e = await falla(() => ident.guardar(req(est, { body: { tipo: 'CC', numero: numeroCC, nombreCompleto: 'Laura' } }), res()));
    ok(e && e.status === 400 && /nombres y apellidos/.test(e.message), 'Nombre sin apellidos → 400');
    r = res(); await ident.guardar(req(est, { body: { tipo: 'cc', numero: `${numeroCC.slice(0, 3)}.${numeroCC.slice(3)}`, nombreCompleto: '  Laura   Gómez Ñañez ' } }), r);
    ok(r.cuerpo.data.numero === `•••• ${numeroCC.slice(-4)}` && r.cuerpo.data.nombreCompleto === 'Laura Gómez Ñañez', 'Se guarda sin puntos y se muestra parcialmente (•••• 1234)');
    e = await falla(() => ident.guardar(req(otro, { body: { tipo: 'CC', numero: numeroCC, nombreCompleto: 'Mateo Otro' } }), res()));
    ok(e && e.status === 409 && /otra cuenta/.test(e.message), 'El mismo documento no puede estar en dos cuentas → 409');

    // 2. Un contrato no se envía si falta el documento del propietario
    await db.query("UPDATE inmuebles SET estado = 'disponible' WHERE id = $1", [inmuebleId]);
    r = res(); await sol.crearSolicitud(req(est, { body: { inmuebleId, fechaIngreso: enDias(12), duracionMeses: 5, personas: 2 } }), r);
    const solId = r.cuerpo.data.id;
    for (const estado of ['en_revision', 'aceptada', 'en_negociacion', 'contrato_pendiente']) await sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado } }), res());
    r = res(); await ct.crearBorrador(req(admin, { params: { id: solId }, body: {
      canonMensual: 650000, deposito: 650000, fechaInicio: enDias(12), duracionMeses: 5, diaPago: 10,
      inmuebleDireccion: 'Calle 15 # 40-23', serviciosIncluidos: 'agua y luz', condiciones: 'No se permiten mascotas.' } }), r);
    const ctId = r.cuerpo.data.id;
    e = await falla(() => ct.enviarContrato(req(admin, { params: { id: ctId } }), res()));
    ok(e && e.status === 409 && /propietario no ha registrado su documento/.test(e.message), `Sin documento del propietario no se envía: "${e && e.message}"`);
    r = res(); await msg.misAvisos(req(prop), r);
    ok(r.cuerpo.data.some((a) => /Registra tu documento/.test(a.titulo) && a.enlace === 'solicitudes.html#documento'), 'Al propietario le llega el aviso "Registra tu documento"');
    ok((await db.query('SELECT estado FROM contratos WHERE id = $1', [ctId])).rows[0].estado === 'borrador', 'El contrato sigue en borrador');

    // 3. Con ambos documentos: se genera y se guarda el PDF sellado
    await ident.guardar(req(prop, { body: { tipo: 'CE', numero: String(500000 + (sello % 400000)), nombreCompleto: 'Carlos Andrés Rodríguez' } }), res());
    await ct.enviarContrato(req(admin, { params: { id: ctId } }), res());
    const c = (await db.query('SELECT * FROM contratos WHERE id = $1', [ctId])).rows[0];
    const doc = (await db.query("SELECT * FROM contratos_documentos WHERE contrato_id = $1 AND tipo = 'original'", [ctId])).rows[0];
    ok(c.estado === 'enviado' && doc && doc.pdf.subarray(0, 5).toString() === '%PDF-' && doc.bytes === doc.pdf.length,
      `Contrato enviado con su PDF (${doc && doc.bytes} bytes)`);
    ok(doc.sha256 === sha(doc.pdf) && c.pdf_sha256 === doc.sha256 && c.plantilla_version === PLANTILLA.version,
      `Huella SHA-256 del PDF guardada en el contrato (${c.pdf_sha256.slice(0, 16)}…) y versión de plantilla ${c.plantilla_version}`);
    ok(c.estudiante_nombre === 'Laura Gómez Ñañez' && c.propietario_nombre === 'Carlos Andrés Rodríguez' && /^C\.C\. [\d.]+$/.test(c.estudiante_documento) && /^C\.E\. /.test(c.propietario_documento),
      `En el contrato quedan los nombres y documentos: ${c.estudiante_documento} y ${c.propietario_documento}`);
    const texto = textoPdf(doc.pdf);
    ok(/CONTRATO DE ARRENDAMIENTO DE VIVIENDA URBANA/.test(texto) && texto.includes('Laura Gómez Ñañez') && texto.includes(c.estudiante_documento)
      && texto.includes('Calle 15 # 40-23') && /\$650\.000/.test(texto) && /No se permiten mascotas/.test(texto),
      'El PDF contiene el título, las partes con su documento, la dirección, el canon y las condiciones particulares');
    ok(/artículo 16 de la Ley 820/.test(texto) && !/dep[oó]sito de \$/i.test(texto), 'El PDF no cobra depósito (artículo 16 de la Ley 820)');
    ok(c.deposito === null, 'Aunque el formulario envíe un depósito, el contrato no lo guarda');
    ok(PLANTILLA.revisada || /PENDIENTE DE REVISI/.test(texto), 'Mientras la plantilla no esté revisada, el PDF lo dice');

    // 4. Descarga
    r = res(); await ct.verContrato(req(est, { params: { id: ctId } }), r);
    ok(r.cuerpo.data.pdf && r.cuerpo.data.pdf.sha256 === doc.sha256 && r.cuerpo.data.pdf.plantillaRevisada === PLANTILLA.revisada, 'La vista del contrato informa la huella del PDF y el estado de la plantilla');
    r = res(); await ct.descargarPdf(req(prop, { params: { id: ctId } }), r);
    ok(r.cabeceras['Content-Type'] === 'application/pdf' && r.cabeceras['X-Roumix-Sha256'] === doc.sha256 && sha(r.binario) === doc.sha256,
      'El propietario descarga exactamente el PDF sellado (misma huella)');
    e = await falla(() => ct.descargarPdf(req(otro, { params: { id: ctId } }), res()));
    ok(e && e.status === 404, 'Otro estudiante no puede descargarlo → 404');
    r = res(); await ct.descargarPdf(req(admin, { params: { id: ctId } }), r);
    ok(sha(r.binario) === doc.sha256, 'El administrador también puede descargarlo');

    // 5. Si alguien alterara el archivo guardado, no se entrega
    await db.query("UPDATE contratos_documentos SET pdf = overlay(pdf placing '\\x41'::bytea from 200 for 1) WHERE contrato_id = $1", [ctId]);
    e = await falla(() => ct.descargarPdf(req(est, { params: { id: ctId } }), res()));
    ok(e && e.status === 500 && /no coincide con su huella/.test(e.message), 'Un PDF alterado se detecta por su huella y no se entrega');
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    const todos = Object.values(ids);
    await db.query('DELETE FROM conversaciones WHERE usuario_id = ANY($1)', [todos]);
    if (inmuebleId) {
      await borrarFirmasDePrueba(db, inmuebleId);
      await db.query('DELETE FROM firmas_codigos WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
      await db.query('DELETE FROM contratos_documentos WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
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
