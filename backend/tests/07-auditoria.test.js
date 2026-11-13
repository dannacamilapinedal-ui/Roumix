// Prueba del módulo 7 (auditoría) contra la BD real. Monta las rutas REALES del panel
// en un servidor local con una autenticación simulada y hace peticiones HTTP.
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1';
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';

const db = require(path.join(backend, 'src/config/db'));
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
notificaciones.usarTransporte({ sendMail: async () => {} });

// Autenticación simulada: el usuario sale de la cabecera x-prueba (solo en esta prueba)
const usuarios = {};
const rutaAuth = require.resolve(path.join(backend, 'src/middleware/auth'));
require.cache[rutaAuth] = {
  id: rutaAuth, filename: rutaAuth, loaded: true,
  exports: {
    requireAuth: (req, res, next) => { req.usuario = usuarios[req.headers['x-prueba']]; return req.usuario ? next() : res.status(401).json({ status: 'error' }); },
    requireRol: (...roles) => (req, res, next) => (roles.includes(req.usuario.rol) ? next() : res.status(403).json({ status: 'error', message: 'Prohibido' })),
    authOpcional: (req, res, next) => next(),
    requireAuthConfigurada: (req, res, next) => next()
  }
};
const express = require(path.join(backend, 'node_modules/express'));
const adminRoutes = require(path.join(backend, 'src/routes/adminRoutes'));
const errorHandler = require(path.join(backend, 'src/middleware/errorHandler'));
const { accionAdmin, datosSeguros } = require(path.join(backend, 'src/services/auditoriaService'));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use(typeof errorHandler === 'function' ? errorHandler : errorHandler.errorHandler);

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const ids = { est: crypto.randomUUID() };
const sello = Date.now();
let servidor;
let base;

async function pedir(quien, metodo, ruta, cuerpo) {
  const r = await fetch(`${base}/api/admin${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-prueba': quien },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { codigo: r.status, json: await r.json().catch(() => ({})) };
}
const ultimas = async (n = 5) => (await db.query('SELECT * FROM auditoria WHERE es_prueba ORDER BY id DESC LIMIT $1', [n])).rows;

(async () => {
  try {
    servidor = http.createServer(app).listen(0);
    base = `http://127.0.0.1:${servidor.address().port}`;

    usuarios.admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    await db.query(
      `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
       VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), '{"rol":"estudiante","nombre":"Laura Auditoría"}', '{}', now(), now())`,
      [ids.est, `prueba-aud-${sello}@roumix.test`]);
    usuarios.estudiante = (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [ids.est])).rows[0];
    const conv = (await db.query(
      `INSERT INTO conversaciones (usuario_id, usuario_rol, asunto) VALUES ($1, 'estudiante', 'Prueba de auditoría') RETURNING id`, [ids.est])).rows[0].id;
    await db.query(`INSERT INTO mensajes (conversacion_id, autor_id, autor_rol, cuerpo) VALUES ($1, $2, 'estudiante', 'Hola')`, [conv, ids.est]);
    ok(conv, `Servidor local en ${base} y conversación de prueba #${conv}`);

    // 1. Traducción de rutas y datos seguros
    ok(accionAdmin('POST', '/pagos/7/devolucion').accion === 'devolucion_registrada' && accionAdmin('POST', '/pagos/7/devolucion').entidadId === '7', 'Ruta → acción: /pagos/7/devolucion = "devolucion_registrada" del pago 7');
    ok(accionAdmin('POST', '/solicitudes/3/contrato').accion === 'contrato_creado' && accionAdmin('POST', '/solicitudes/3').accion === 'solicitud_actualizada', 'Distingue "contrato_creado" de "solicitud_actualizada"');
    ok(accionAdmin('POST', '/nueva-ruta').accion === 'admin_post', 'Una ruta nueva sin mapear igual queda registrada (admin_post)');
    const d = datosSeguros({ estado: 'en_revision', notaEstudiante: 'Mi celular es 3101234567', mensaje: 'texto privado', motivo: 'Duplicada' });
    ok(d.estado === 'en_revision' && d.motivo === 'Duplicada' && !JSON.stringify(d).includes('3101234567') && d.incluyo_texto.includes('notaEstudiante'),
      'Guarda decisiones y motivos, pero NO el contenido de mensajes/notas (solo que venían)');

    // 2. Acciones reales por HTTP
    let r = await pedir('admin', 'POST', `/conversaciones/${conv}/mensajes`, { mensaje: 'Nota sobre la estudiante', interna: true });
    let [a] = await ultimas(1);
    ok(r.codigo === 201 && a.accion === 'nota_interna_registrada' && a.entidad === 'conversacion' && a.entidad_id === String(conv) && a.actor_id === usuarios.admin.id,
      'Nota interna → "nota_interna_registrada" con el admin y la conversación');
    ok(!JSON.stringify(a.datos).includes('Nota sobre la estudiante') && a.ip_huella && a.ip_huella.length === 40, 'No guarda el texto de la nota y la IP queda como huella (hash)');
    r = await pedir('admin', 'POST', `/conversaciones/${conv}/mensajes`, { mensaje: 'Hola Laura, te respondemos.' });
    [a] = await ultimas(1);
    ok(r.codigo === 201 && a.accion === 'mensaje_respondido' && /Respuesta enviada/.test(a.resumen), 'Respuesta → "mensaje_respondido" con el resumen de la operación');
    r = await pedir('admin', 'POST', `/conversaciones/${conv}/estado`, { estado: 'pendiente' });
    [a] = await ultimas(1);
    ok(r.codigo === 200 && a.accion === 'conversacion_estado' && a.datos.estado === 'pendiente', 'Cambio de estado → "conversacion_estado" con el nuevo estado');

    // 3. Lo que NO se registra
    const antes = (await db.query('SELECT count(*)::int n FROM auditoria WHERE es_prueba')).rows[0].n;
    r = await pedir('admin', 'POST', `/conversaciones/${conv}/estado`, { estado: 'cerrada' });
    ok(r.codigo === 400, 'Acción inválida → 400');
    r = await pedir('admin', 'GET', '/resumen');
    ok(r.codigo === 200, 'Consulta (GET) → 200');
    const despues = (await db.query('SELECT count(*)::int n FROM auditoria WHERE es_prueba')).rows[0].n;
    ok(despues === antes, 'Ni las acciones fallidas ni las consultas generan registros');

    // 4. Intento de un no-admin
    r = await pedir('estudiante', 'POST', '/pagos/1/devolucion', { motivo: 'quiero mi plata' });
    [a] = await ultimas(1);
    ok(r.codigo === 403 && a.accion === 'acceso_denegado_panel' && a.actor_id === ids.est && /pagos\/1\/devolucion/.test(a.resumen),
      'Un estudiante que intenta usar el panel → 403 y queda registrado "acceso_denegado_panel"');

    // 5. Resumen ampliado
    r = await pedir('admin', 'GET', '/resumen');
    const s = r.json.data;
    ok(['estudiantes', 'propietarios'].every((k) => typeof s.usuarios[k] === 'number') && typeof s.verificaciones.porRevisar === 'number' &&
       typeof s.inmuebles.visibles === 'number' && typeof s.solicitudes.nuevas === 'number' && typeof s.contratos.formalizados === 'number' &&
       typeof s.pagos.registrados === 'number' && typeof s.pagos.comisiones === 'number',
      'El resumen trae las 8 cifras del encargo (estudiantes, propietarios, por revisar, publicaciones, solicitudes, contratos, pagos y comisiones)');

    // 6. Consulta de la auditoría
    r = await pedir('admin', 'GET', '/auditoria');
    ok(r.codigo === 200 && Array.isArray(r.json.data) && !r.json.data.some((x) => x.entidad_id === String(conv)), 'GET /auditoria responde y oculta los registros de prueba');
    ok(r.json.data.some((x) => x.origen === 'moderacion'), 'Incluye el historial de moderación copiado');
    r = await pedir('admin', 'GET', '/auditoria?entidad=inmueble');
    ok(r.json.data.every((x) => x.entidad === 'inmueble'), 'Filtro por entidad');
    r = await pedir('admin', 'GET', '/auditoria?actor=admin');
    ok(r.json.data.every((x) => x.actor_rol === 'admin'), 'Filtro por responsable');
    r = await pedir('admin', 'GET', '/auditoria?desde=2020-01-01&hasta=2020-01-02');
    ok(r.codigo === 200 && r.json.data.length === 0, 'Filtro por fechas');
    r = await pedir('admin', 'GET', '/auditoria?desde=ayer');
    ok(r.codigo === 400, 'Fecha inválida → 400');
    r = await pedir('admin', 'GET', '/auditoria?entidad=x;drop');
    ok(r.codigo === 400, 'Entidad con caracteres raros → 400');
    const primero = (await pedir('admin', 'GET', '/auditoria')).json.data;
    if (primero.length > 1) {
      r = await pedir('admin', 'GET', `/auditoria?antes=${primero[0].id}`);
      ok(r.json.data.length > 0 && r.json.data.every((x) => Number(x.id) < Number(primero[0].id)), 'Paginación con "antes" (cursor)');
    } else ok(true, 'Paginación (sin datos suficientes para probar)');

    // 7. Solo adición
    const real = (await db.query('SELECT id FROM auditoria WHERE NOT es_prueba ORDER BY id LIMIT 1')).rows[0];
    let e = await db.query('UPDATE auditoria SET resumen = $2 WHERE id = $1', [real.id, 'alterado']).catch((x) => x);
    ok(e instanceof Error && /solo adición/.test(e.message), 'Modificar un registro real → rechazado por la base de datos');
    e = await db.query('DELETE FROM auditoria WHERE id = $1', [real.id]).catch((x) => x);
    ok(e instanceof Error && /solo adición/.test(e.message), 'Borrar un registro real → rechazado por la base de datos');

    // 8. Disparador desde moderacion_historial (acciones del sistema o de usuarios)
    await db.query(`INSERT INTO moderacion_historial (usuario_afectado_id, admin_id, accion, justificacion) VALUES ($1, NULL, 'prueba_sistema', 'Evento del sistema')`, [ids.est]);
    [a] = await ultimas(1);
    ok(a.accion === 'prueba_sistema' && a.origen === 'moderacion' && a.es_prueba, 'Un evento del sistema en moderacion_historial llega a la auditoría (marcado como prueba)');
    const conAdmin = (await db.query(`INSERT INTO moderacion_historial (usuario_afectado_id, admin_id, accion, justificacion) VALUES ($1, $2, 'prueba_admin', 'x') RETURNING id`, [ids.est, usuarios.admin.id])).rows[0].id;
    const copia = (await db.query("SELECT count(*)::int n FROM auditoria WHERE datos->>'historial_id' = $1", [String(conAdmin)])).rows[0].n;
    ok(copia === 0, 'Las acciones del admin no se duplican (las registra el backend con más detalle)');
    await db.query('DELETE FROM moderacion_historial WHERE usuario_afectado_id = $1', [ids.est]);
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    if (servidor) servidor.close();
    await db.query('DELETE FROM conversaciones WHERE usuario_id = $1', [ids.est]);
    await db.query('DELETE FROM moderacion_historial WHERE usuario_afectado_id = $1', [ids.est]).catch(() => {});
    const borrados = (await db.query('DELETE FROM auditoria WHERE es_prueba')).rowCount;
    console.log(`🧹 ${borrados} registro(s) de auditoría de prueba borrados`);
    await db.query('DELETE FROM auth.users WHERE id = $1', [ids.est]);
    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
    process.exitCode = fallos ? 1 : 0;
    await db.pool.end();
  }
})();
