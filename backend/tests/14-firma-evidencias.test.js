// Prueba del módulo F-3 (firma manuscrita dibujada y evidencias de cada firma).
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';

const db = require(path.join(backend, 'src/config/db'));
const { firmaPrueba, pngFirma, borrarFirmasDePrueba } = require('./_firma');
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
const correos = [];
notificaciones.usarTransporte({ sendMail: async (m) => { correos.push(m); } });
const ct = require(path.join(backend, 'src/controllers/contratosController'));
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));
const { CONSENTIMIENTO } = require(path.join(backend, 'src/services/firmaService'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const NAVEGADOR = 'Mozilla/5.0 (Linux; Android 14) Prueba Roumix';
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, ip: '181.50.1.23', protocol: 'https', get: (h) => (String(h).toLowerCase() === 'user-agent' ? NAVEGADOR : 'roumix.prueba'), ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enDias = (d) => new Date(Date.now() - 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const ids = { est: crypto.randomUUID(), prop: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;

async function crearUsuario(id, rol, nombre, nombreDoc) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-firma-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  await db.query("INSERT INTO documentos_identidad (usuario_id, tipo, numero, nombre_completo) VALUES ($1, 'PA', $2, $3)",
    [id, 'PRB' + crypto.randomBytes(5).toString('hex').toUpperCase(), nombreDoc]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}

(async () => {
  try {
    const est = await crearUsuario(ids.est, 'estudiante', 'Laura', 'Laura Gómez Ñañez');
    const prop = await crearUsuario(ids.prop, 'propietario', 'Carlos', 'Carlos Andrés Rodríguez');
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision, version_condiciones, acepta_comision_en)
      VALUES ($1, 'aprobado', 'Carlos Andrés Rodríguez', true, '2027-01', now())`, [ids.prop]);
    const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba firma', 'habitacion', 'Habitación', 700000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;
    let r = res(); await sol.crearSolicitud(req(est, { body: { inmuebleId, fechaIngreso: enDias(12), duracionMeses: 3, personas: 1 } }), r);
    const solId = r.cuerpo.data.id;
    for (const estado of ['en_revision', 'aceptada', 'en_negociacion', 'contrato_pendiente']) await sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado } }), res());
    r = res(); await ct.crearBorrador(req(admin, { params: { id: solId }, body: { canonMensual: 700000, fechaInicio: enDias(12), duracionMeses: 3 } }), r);
    const ctId = r.cuerpo.data.id;
    await ct.enviarContrato(req(admin, { params: { id: ctId } }), res());
    const pdfSha = (await db.query('SELECT pdf_sha256 FROM contratos WHERE id = $1', [ctId])).rows[0].pdf_sha256;

    // El código se pide como lo haría la persona y se lee del correo
    await ct.solicitarCodigo(req(est, { params: { id: ctId } }), res());
    const codigo = correos[correos.length - 1].html.match(/>(\d{6})</)[1];
    const firmar = (body) => ct.aceptarContrato(req(est, { params: { id: ctId }, body: { firma: 'Laura Gómez', confirmo: true, firmaImagen: firmaPrueba, codigo, ...body } }), res());
    const codigoSigueVigente = async () => (await db.query(
      'SELECT count(*)::int n FROM firmas_codigos WHERE contrato_id = $1 AND usuario_id = $2 AND usado_en IS NULL AND anulado_en IS NULL', [ctId, est.id])).rows[0].n === 1;

    // 1. Firmas no válidas (el código NO se gasta)
    let e = await falla(() => firmar({ firmaImagen: undefined }));
    ok(e && e.status === 400 && /Dibuja tu firma/.test(e.message), 'Sin dibujar la firma → 400');
    e = await falla(() => firmar({ firmaImagen: pngFirma({ conTinta: false }) }));
    ok(e && e.status === 400 && /vacía/.test(e.message), 'Un recuadro vacío no es una firma → 400');
    e = await falla(() => firmar({ firmaImagen: 'data:image/png;base64,' + Buffer.from('no es un png de verdad, es texto').toString('base64') }));
    ok(e && e.status === 400 && /no es una imagen válida/.test(e.message), 'Un archivo que no es PNG → 400');
    e = await falla(() => firmar({ firma: 'Carlos Rodríguez' }));
    ok(e && e.status === 400 && /como aparece en tu documento: Laura Gómez Ñañez/.test(e.message), `Nombre que no corresponde al documento → 400 "${e && e.message}"`);
    ok(await codigoSigueVigente(), 'Ninguno de esos errores gastó el código del correo');

    // 2. Firma válida (con un nombre sin tildes ni segundo apellido)
    r = res(); await ct.aceptarContrato(req(est, { params: { id: ctId }, body: { firma: 'laura gomez', confirmo: true, firmaImagen: firmaPrueba, codigo } }), r);
    const f = (await db.query('SELECT * FROM firmas_contrato WHERE contrato_id = $1 AND rol = $2', [ctId, 'arrendatario'])).rows[0];
    const png = Buffer.from(firmaPrueba.split(',')[1], 'base64');
    ok(f && f.usuario_id === est.id && f.nombre_escrito === 'laura gomez' && /^Pasaporte PRB/.test(f.documento),
      'Firma guardada: rol arrendatario, nombre escrito y documento');
    ok(f.firma_sha256 === sha(png) && Buffer.compare(f.firma_png, png) === 0, 'La imagen de la firma se guarda tal cual, con su huella SHA-256');
    ok(f.consentimiento === CONSENTIMIENTO && /Ley 527 de 1999/.test(f.consentimiento), 'Se guarda el texto exacto del consentimiento aceptado');
    ok(f.codigo_id && f.codigo_enviado_a === est.email && f.pdf_sha256 === pdfSha,
      'Evidencias: el código usado, el correo al que llegó y la huella del PDF firmado');
    ok(f.ip === '181.50.1.23' && f.dispositivo === NAVEGADOR && f.firmado_en, 'Evidencias: IP, dispositivo (navegador) y fecha y hora');

    // 3. Las firmas no se pueden alterar ni borrar
    e = await falla(() => db.query("UPDATE firmas_contrato SET nombre_escrito = 'Otra persona' WHERE id = $1", [f.id]));
    ok(e && /no se pueden modificar ni borrar/.test(e.message), 'Nadie puede modificar una firma (ni desde la base de datos)');
    e = await falla(() => db.query('DELETE FROM firmas_contrato WHERE id = $1', [f.id]));
    ok(e && /no se pueden modificar ni borrar/.test(e.message), 'Nadie puede borrar una firma');

    // 4. Lo que ve cada uno
    r = res(); await ct.verContrato(req(prop, { params: { id: ctId } }), r);
    const vistaProp = r.cuerpo.data.firmas[0];
    ok(vistaProp && vistaProp.rol === 'arrendatario' && /^data:image\/png;base64,/.test(vistaProp.imagen) && vistaProp.ip === undefined && vistaProp.correo === undefined,
      'La otra parte ve la firma (imagen, nombre y fecha) pero no la IP ni el correo');
    r = res(); await ct.verContrato(req(admin, { params: { id: ctId } }), r);
    ok(r.cuerpo.data.firmas[0].ip === '181.50.1.23' && r.cuerpo.data.firmas[0].dispositivo === NAVEGADOR, 'El equipo de Roumix ve las evidencias completas');

    // 5. Firma el propietario → contrato formalizado con dos firmas
    const codigoProp = await ct.crearCodigoFirma(ctId, prop.id);
    r = res(); await ct.aceptarContrato(req(prop, { params: { id: ctId }, body: { firma: 'Carlos Rodríguez', confirmo: true, firmaImagen: firmaPrueba, codigo: codigoProp } }), r);
    const c = (await db.query('SELECT estado FROM contratos WHERE id = $1', [ctId])).rows[0];
    const n = (await db.query('SELECT count(*)::int n FROM firmas_contrato WHERE contrato_id = $1', [ctId])).rows[0].n;
    ok(c.estado === 'formalizado' && n === 2, 'Con las dos firmas el contrato queda formalizado');
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    const todos = Object.values(ids);
    await db.query('DELETE FROM conversaciones WHERE usuario_id = ANY($1)', [todos]);
    if (inmuebleId) {
      const pagosIds = (await db.query('SELECT p.id FROM pagos p JOIN solicitudes s ON s.id = p.solicitud_id WHERE s.inmueble_id = $1', [inmuebleId])).rows.map((x) => x.id);
      await borrarFirmasDePrueba(db, inmuebleId);
      await db.query('DELETE FROM firmas_codigos WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
      await db.query('DELETE FROM contratos_documentos WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
      await db.query('DELETE FROM pagos_eventos WHERE pago_id = ANY($1)', [pagosIds]);
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
