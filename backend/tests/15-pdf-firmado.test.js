// Prueba del módulo F-4 (PDF firmado con certificado y verificación pública).
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';

const { PDFDocument } = require('pdf-lib');
const db = require(path.join(backend, 'src/config/db'));
const { firmaPrueba, borrarFirmasDePrueba } = require('./_firma');
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
const correos = [];
notificaciones.usarTransporte({ sendMail: async (m) => { correos.push(m); } });
const ct = require(path.join(backend, 'src/controllers/contratosController'));
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));
const verificar = require(path.join(backend, 'src/controllers/verificarController'));
const firmado = require(path.join(backend, 'src/services/contratoFirmadoService'));
const limites = require(path.join(backend, 'src/services/limitesService'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => {
  const r = { codigo: 200, cabeceras: {} };
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (j) => { r.cuerpo = j; return r; };
  r.set = (h, v) => { if (typeof h === 'string') r.cabeceras[h] = v; else Object.assign(r.cabeceras, h); return r; };
  r.send = (b) => { r.binario = b; return r; };
  return r;
};
const IP_PRUEBA = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, ip: '181.50.1.23', protocol: 'https', get: () => 'Prueba Roumix', ...extra });
const publico = (params) => ({ params, query: {}, ip: IP_PRUEBA, get: () => 'Prueba Roumix' });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enDias = (d) => new Date(Date.now() - 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function textoPdf(b) {
  let contenido = '';
  for (const m of b.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { contenido += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch (e) { contenido += m[1]; }
  }
  return [...contenido.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('\n');
}

const ids = { est: crypto.randomUUID(), prop: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;

async function crearUsuario(id, rol, nombre, nombreDoc) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-firmado-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  await db.query("INSERT INTO documentos_identidad (usuario_id, tipo, numero, nombre_completo) VALUES ($1, 'PA', $2, $3)",
    [id, 'PRB' + crypto.randomBytes(5).toString('hex').toUpperCase(), nombreDoc]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}

(async () => {
  try {
    const est = await crearUsuario(ids.est, 'estudiante', 'Laura', 'Laura Gómez Ñañez');
    const prop = await crearUsuario(ids.prop, 'propietario', 'Carlos', 'Carlos Andrés Rodríguez');
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision, version_condiciones, acepta_comision_en)
      VALUES ($1, 'aprobado', 'Carlos Andrés Rodríguez', true, '2026-12', now())`, [ids.prop]);
    const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba PDF firmado', 'habitacion', 'Habitación', 720000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;
    let r = res(); await sol.crearSolicitud(req(est, { body: { inmuebleId, fechaIngreso: enDias(12), duracionMeses: 3, personas: 1 } }), r);
    const solId = r.cuerpo.data.id;
    for (const estado of ['en_revision', 'aceptada', 'en_negociacion', 'contrato_pendiente']) await sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado } }), res());
    r = res(); await ct.crearBorrador(req(admin, { params: { id: solId }, body: { canonMensual: 720000, fechaInicio: enDias(12), duracionMeses: 3 } }), r);
    const ctId = r.cuerpo.data.id;
    await ct.enviarContrato(req(admin, { params: { id: ctId } }), res());
    const original = (await db.query("SELECT pdf, sha256, cajas_firma FROM contratos_documentos WHERE contrato_id = $1 AND tipo = 'original'", [ctId])).rows[0];
    const paginasOriginal = (await PDFDocument.load(original.pdf)).getPageCount();
    ok(Array.isArray(original.cajas_firma) && original.cajas_firma.length === 2 &&
      original.cajas_firma.every((c) => ['arrendador', 'arrendatario'].includes(c.rol) && c.ancho > 0 && c.alto > 0),
    'Al enviar, se guarda dónde va cada firma en el PDF (página y recuadro)');

    // 1. Con una sola firma no hay PDF firmado
    const codigoEst = await ct.crearCodigoFirma(ctId, est.id);
    r = res(); await ct.aceptarContrato(req(est, { params: { id: ctId }, body: { firma: 'Laura Gómez', confirmo: true, firmaImagen: firmaPrueba, codigo: codigoEst } }), r);
    ok(r.cuerpo.data.firmado === null && (await firmado.asegurarPdfFirmado(ctId)) === null, 'Con una sola firma todavía no hay PDF firmado');

    // 2. Firma la segunda parte → PDF firmado, código y correos
    correos.length = 0;
    const codigoProp = await ct.crearCodigoFirma(ctId, prop.id);
    r = res(); await ct.aceptarContrato(req(prop, { params: { id: ctId }, body: { firma: 'Carlos Rodríguez', confirmo: true, firmaImagen: firmaPrueba, codigo: codigoProp } }), r);
    const resp = r.cuerpo.data.firmado;
    ok(r.cuerpo.data.estado === 'formalizado' && resp && /^RMX-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(resp.codigo),
      `Al formalizarse se genera el PDF firmado con su código de verificación (${resp && resp.codigo})`);
    const c = (await db.query('SELECT codigo_verificacion, pdf_firmado_sha256 FROM contratos WHERE id = $1', [ctId])).rows[0];
    const doc = (await db.query("SELECT pdf, sha256, bytes FROM contratos_documentos WHERE contrato_id = $1 AND tipo = 'firmado'", [ctId])).rows[0];
    ok(doc && sha(doc.pdf) === doc.sha256 && doc.sha256 === c.pdf_firmado_sha256 && doc.bytes === doc.pdf.length && c.codigo_verificacion === resp.codigo,
      'El PDF firmado queda guardado con su huella, y el contrato con el código y la huella');
    ok(doc.sha256 !== original.sha256, 'El PDF firmado es un archivo distinto del original (que se conserva intacto)');

    const pdfFirmado = await PDFDocument.load(doc.pdf);
    ok(pdfFirmado.getPageCount() === paginasOriginal + 1, `El PDF firmado tiene las páginas del original más el certificado (${pdfFirmado.getPageCount()})`);
    const imagenes = (doc.pdf.toString('latin1').match(/\/Subtype \/Image/g) || []).length;
    ok(imagenes >= 2, `Las dos firmas dibujadas van como imágenes dentro del PDF (${imagenes})`);
    const texto = textoPdf(doc.pdf);
    ok(/CERTIFICADO DE FIRMA ELECTR/.test(texto) && texto.includes(resp.codigo) && texto.includes(original.sha256),
      'La página de certificado tiene el título, el código y la huella del PDF original');
    ok(/ARRENDADOR/.test(texto) && /ARRENDATARIO/.test(texto) && texto.includes('Laura Gómez') && texto.includes('Carlos Rodríguez'),
      'El certificado identifica a los dos firmantes');
    ok(!texto.includes(est.email) && !texto.includes(prop.email) && !texto.includes('181.50.1.23'),
      'El certificado no muestra los correos completos ni la IP de nadie');
    ok(/pendiente de revisi/.test(texto), 'El certificado dice que la plantilla está pendiente de revisión legal');

    const avisos = correos.filter((m) => /formalizado/.test(m.subject) && m.html.includes(resp.codigo));
    ok(avisos.length === 2 && avisos.some((m) => m.to === est.email) && avisos.some((m) => m.to === prop.email),
      'Ambas partes reciben un correo con el código de verificación');

    // 3. Descarga y vista de las partes
    r = res(); await ct.descargarPdf(req(est, { params: { id: ctId } }), r);
    ok(Buffer.compare(r.binario, doc.pdf) === 0 && r.cabeceras['X-Roumix-Sha256'] === doc.sha256 && /firmado\.pdf/.test(r.cabeceras['Content-Disposition']),
      'La parte descarga el PDF firmado (no el original)');
    r = res(); await ct.verContrato(req(prop, { params: { id: ctId } }), r);
    const vista = r.cuerpo.data.firmado;
    ok(vista && vista.codigo === resp.codigo && vista.sha256 === doc.sha256 && vista.verificarEn.endsWith(`verificar.html?codigo=${resp.codigo}`),
      'La página del contrato muestra el código, la huella y el enlace para verificar');

    // 4. Idempotencia: no se genera otro
    const otra = await firmado.asegurarPdfFirmado(ctId);
    const cuantos = (await db.query("SELECT count(*)::int n FROM contratos_documentos WHERE contrato_id = $1 AND tipo = 'firmado'", [ctId])).rows[0].n;
    ok(otra && otra.nuevo === false && otra.sha256 === doc.sha256 && otra.codigo === resp.codigo && cuantos === 1, 'Pedirlo de nuevo no genera otro PDF ni cambia el código');

    // 5. Si faltaba (por un error al formalizar), la descarga lo genera con el mismo código
    await db.query("DELETE FROM contratos_documentos WHERE contrato_id = $1 AND tipo = 'firmado'", [ctId]);
    r = res(); await ct.descargarPdf(req(prop, { params: { id: ctId } }), r);
    const regenerado = (await db.query('SELECT codigo_verificacion, pdf_firmado_sha256 FROM contratos WHERE id = $1', [ctId])).rows[0];
    ok(/firmado\.pdf/.test(r.cabeceras['Content-Disposition']) && regenerado.codigo_verificacion === resp.codigo &&
      regenerado.pdf_firmado_sha256 === r.cabeceras['X-Roumix-Sha256'],
    'Si el PDF firmado faltaba, la descarga lo genera de nuevo con el mismo código');
    const actual = r.binario;

    // 6. Verificación pública por código
    r = res(); await verificar.porCodigo(publico({ codigo: resp.codigo.toLowerCase().replace(/-/g, '- ') }), r);
    const v = r.cuerpo.data;
    ok(v && v.contrato === ctId && v.estado === 'formalizado' && v.sha256Firmado === sha(actual) && v.sha256Original === original.sha256,
      'Con el código (aunque se escriba en minúsculas) se verifica el contrato y sus huellas');
    ok(v.firmantes.length === 2 && v.firmantes.some((f) => f.rol === 'arrendatario' && f.iniciales === 'L. G.') &&
      v.firmantes.some((f) => f.rol === 'arrendador' && f.iniciales === 'C. R.'), 'Muestra los firmantes solo con sus iniciales');
    const json = JSON.stringify(r.cuerpo);
    ok(!/Laura|Carlos|Gómez|Rodríguez|PRB|@roumix\.test|Habitación|181\.50/.test(json), 'La verificación pública no expone nombres, documentos, correos, inmueble ni IP');
    ok(r.cabeceras['Cache-Control'] === 'no-store', 'La respuesta pública no se guarda en caché');

    // 7. Verificación por el archivo (huella)
    r = res(); await verificar.porHuella(publico({ sha256: sha(actual) }), r);
    ok(r.cuerpo.data.contrato === ctId, 'Con solo el archivo (su huella) también se verifica');
    const alterado = Buffer.from(actual);
    alterado[alterado.length - 20] ^= 0x01;
    let e = await falla(() => verificar.porHuella(publico({ sha256: sha(alterado) }), res()));
    ok(e && e.status === 404 && /no coincide/.test(e.message), 'Un archivo con un solo byte cambiado no se verifica → 404');
    e = await falla(() => verificar.porHuella(publico({ sha256: 'no-es-una-huella' }), res()));
    ok(e && e.status === 400, 'Una huella mal formada → 400');
    e = await falla(() => verificar.porHuella(publico({ sha256: original.sha256 }), res()));
    ok(e && e.status === 404, 'El PDF original (sin firmas) no pasa como contrato firmado');

    // 8. Códigos equivocados y límite de intentos
    e = await falla(() => verificar.porCodigo(publico({ codigo: firmado.nuevoCodigo() }), res()));
    ok(e && e.status === 404, 'Un código que no existe → 404');
    e = await falla(() => verificar.porCodigo(publico({ codigo: 'hola' }), res()));
    ok(e && e.status === 404, 'Un texto que no tiene forma de código → 404');
    for (let i = 0; i < 25; i++) await falla(() => verificar.porCodigo(publico({ codigo: firmado.nuevoCodigo() }), res()));
    e = await falla(() => verificar.porCodigo(publico({ codigo: resp.codigo }), res()));
    ok(e && e.status === 429, 'Tras muchas búsquedas fallidas desde la misma IP se bloquea un rato → 429');
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    const todos = Object.values(ids);
    await db.query('DELETE FROM limites_uso WHERE clave = $1', [`verificar:${limites.huella(IP_PRUEBA)}`]).catch(() => {});
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
