// Prueba del módulo F-2 (código de un solo uso al correo para firmar el contrato).
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';

const db = require(path.join(backend, 'src/config/db'));
const { firmaPrueba, borrarFirmasDePrueba } = require('./_firma');
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
const correos = [];
notificaciones.usarTransporte({ sendMail: async (m) => { correos.push(m); } });
const ct = require(path.join(backend, 'src/controllers/contratosController'));
const sol = require(path.join(backend, 'src/controllers/solicitudesController'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, body: {}, query: {}, params: {}, ip: '127.0.0.1', protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enDias = (d) => new Date(Date.now() - 5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);
// El código llega en el correo: se lee de ahí, como lo haría la persona
const codigoDelCorreo = () => { const m = correos[correos.length - 1].html.match(/>(\d{6})</); return m && m[1]; };
const permitirReenvio = (ctId, uid) => db.query("UPDATE firmas_codigos SET created_at = created_at - interval '2 minutes' WHERE contrato_id = $1 AND usuario_id = $2", [ctId, uid]);

const ids = { est: crypto.randomUUID(), prop: crypto.randomUUID(), otro: crypto.randomUUID() };
const sello = Date.now();
let inmuebleId = null;

async function crearUsuario(id, rol, nombre) {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), $3, '{}', now(), now())`,
    [id, `prueba-otp-${rol}-${id.slice(0, 6)}-${sello}@roumix.test`, JSON.stringify({ rol, nombre })]);
  await db.query("INSERT INTO documentos_identidad (usuario_id, tipo, numero, nombre_completo) VALUES ($1, 'PA', $2, $3)",
    [id, 'PRB' + crypto.randomBytes(5).toString('hex').toUpperCase(), `${nombre} Prueba`]);
  return (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [id])).rows[0];
}

(async () => {
  try {
    const est = await crearUsuario(ids.est, 'estudiante', 'Laura');
    const prop = await crearUsuario(ids.prop, 'propietario', 'Carlos');
    // El propietario deja de tener el correo confirmado (para probar que así no recibe código)
    await db.query('UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1', [ids.prop]);
    const otro = await crearUsuario(ids.otro, 'estudiante', 'Mateo');
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado, nombre_completo, acepta_comision, version_condiciones, acepta_comision_en)
      VALUES ($1, 'aprobado', 'Carlos Prueba', true, '2027-01', now())`, [ids.prop]);
    const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    inmuebleId = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, 'Habitación prueba código', 'habitacion', 'Habitación', 600000, 'Barzal', 'Santo Tomás', 4.13, -73.62, 'https://prueba.local/f.jpg', ARRAY['https://prueba.local/f.jpg'], 'disponible', 'aprobada') RETURNING id`,
      [ids.prop])).rows[0].id;
    let r = res(); await sol.crearSolicitud(req(est, { body: { inmuebleId, fechaIngreso: enDias(12), duracionMeses: 3, personas: 1 } }), r);
    const solId = r.cuerpo.data.id;
    for (const estado of ['en_revision', 'aceptada', 'en_negociacion', 'contrato_pendiente']) await sol.actualizarAdmin(req(admin, { params: { id: solId }, body: { estado } }), res());
    r = res(); await ct.crearBorrador(req(admin, { params: { id: solId }, body: { canonMensual: 600000, fechaInicio: enDias(12), duracionMeses: 3 } }), r);
    const ctId = r.cuerpo.data.id;

    // 0. Un borrador no se firma
    let e = await falla(() => ct.solicitarCodigo(req(est, { params: { id: ctId } }), res()));
    ok(e && e.status === 404, 'No se puede pedir código para un contrato que no se ha enviado → 404');
    await ct.enviarContrato(req(admin, { params: { id: ctId } }), res());

    // 1. Pedir el código
    e = await falla(() => ct.solicitarCodigo(req(otro, { params: { id: ctId } }), res()));
    ok(e && e.status === 404, 'Quien no es parte no puede pedir código → 404');
    e = await falla(() => ct.solicitarCodigo(req(prop, { params: { id: ctId } }), res()));
    ok(e && e.status === 403 && /Confirma tu correo/.test(e.message), 'Con el correo sin confirmar no se envía código → 403');
    correos.length = 0;
    r = res(); await ct.solicitarCodigo(req(est, { params: { id: ctId } }), r);
    const codigo1 = codigoDelCorreo();
    ok(r.cuerpo.data.enviadoA.startsWith('p•••••@') && r.cuerpo.data.minutos === 10 && !JSON.stringify(r.cuerpo).match(/\d{6}/),
      `"${r.cuerpo.message}" (la respuesta NO trae el código)`);
    ok(correos.length === 1 && correos[0].to.includes(est.email) && /^\d{6}$/.test(codigo1) && /No lo compartas/.test(correos[0].html),
      'El código de 6 dígitos llega solo al correo del estudiante, con la advertencia de no compartirlo');
    const filas = (await db.query('SELECT * FROM firmas_codigos WHERE contrato_id = $1 AND usuario_id = $2', [ctId, est.id])).rows;
    ok(filas.length === 1 && !JSON.stringify(filas).includes(codigo1) && filas[0].enviado_a === est.email,
      'En la base de datos queda la huella del código, no el código, y a qué correo se envió');
    e = await falla(() => ct.solicitarCodigo(req(est, { params: { id: ctId } }), res()));
    ok(e && e.status === 429 && /Espera \d+ segundos/.test(e.message), `Pedir otro enseguida → 429 "${e && e.message}"`);

    // 2. Firmar sin código o con un código equivocado
    const firmar = (codigo) => ct.aceptarContrato(req(est, { params: { id: ctId }, body: { firma: 'Laura Prueba', confirmo: true, firmaImagen: firmaPrueba, codigo } }), res());
    e = await falla(() => firmar(undefined));
    ok(e && e.status === 400 && /6 dígitos/.test(e.message), 'Sin código no se puede firmar → 400');
    const malo = codigo1 === '000000' ? '111111' : '000000';
    e = await falla(() => firmar(malo));
    ok(e && e.status === 400 && /Te quedan 4 intento/.test(e.message), `Código equivocado: "${e && e.message}"`);

    // 3. Pedir otro anula el anterior
    await permitirReenvio(ctId, est.id);
    await ct.solicitarCodigo(req(est, { params: { id: ctId } }), res());
    const codigo2 = codigoDelCorreo();
    if (codigo2 !== codigo1) {
      e = await falla(() => firmar(codigo1));
      ok(e && e.status === 400, 'El código anterior deja de servir cuando se pide uno nuevo');
    } else {
      ok(true, 'El código anterior deja de servir cuando se pide uno nuevo (coincidencia aleatoria: se omite)');
    }

    // 4. Vencimiento
    await db.query("UPDATE firmas_codigos SET expira_en = now() - interval '1 minute' WHERE contrato_id = $1 AND usuario_id = $2 AND usado_en IS NULL AND anulado_en IS NULL", [ctId, est.id]);
    e = await falla(() => firmar(codigo2));
    ok(e && e.status === 400 && /venció/.test(e.message), 'Un código vencido (más de 10 minutos) no sirve');

    // 5. Intentos agotados
    await permitirReenvio(ctId, est.id);
    await ct.solicitarCodigo(req(est, { params: { id: ctId } }), res());
    const codigo3 = codigoDelCorreo();
    const otroMalo = codigo3 === '999999' ? '888888' : '999999';
    for (let i = 0; i < 4; i++) await falla(() => firmar(otroMalo));
    e = await falla(() => firmar(otroMalo));
    ok(e && e.status === 429 && /demasiadas veces/.test(e.message), 'Al 5.º intento equivocado el código se anula → 429');
    e = await falla(() => firmar(codigo3));
    ok(e && e.status === 400, 'Después de agotar los intentos ni el código correcto sirve: hay que pedir otro');

    // 6. Firma correcta
    await permitirReenvio(ctId, est.id);
    await ct.solicitarCodigo(req(est, { params: { id: ctId } }), res());
    const codigo4 = codigoDelCorreo();
    r = res(); await ct.aceptarContrato(req(est, { params: { id: ctId }, body: { firma: 'Laura Prueba', confirmo: true, firmaImagen: firmaPrueba, codigo: ` ${codigo4.slice(0, 3)} ${codigo4.slice(3)} ` } }), r);
    const c = (await db.query('SELECT estado, aceptado_estudiante_en FROM contratos WHERE id = $1', [ctId])).rows[0];
    ok(c.estado === 'pendiente_aceptacion' && c.aceptado_estudiante_en, 'Con el código correcto (aunque tenga espacios) el estudiante firma');
    const usado = (await db.query('SELECT usado_en FROM firmas_codigos WHERE contrato_id = $1 AND usuario_id = $2 ORDER BY id DESC LIMIT 1', [ctId, est.id])).rows[0];
    ok(usado.usado_en, 'El código queda marcado como usado');
    const aud = (await db.query("SELECT datos FROM auditoria WHERE entidad = 'contrato' AND entidad_id = $1 AND accion = 'contrato_aceptado' ORDER BY id DESC LIMIT 1", [String(ctId)])).rows[0];
    ok(aud && aud.datos.codigo_enviado_a === est.email && aud.datos.pdf_sha256, 'La auditoría guarda a qué correo llegó el código y la huella del PDF firmado');
    e = await falla(() => firmar(codigo4));
    ok(e && e.status === 409, 'No se puede firmar dos veces');
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
