// Prueba del módulo 2 (publicaciones: capacidad, retirar, pausa del admin) contra la BD real,
// con un propietario y un inmueble de prueba que se borran al final.
const path = require('path');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
process.chdir(backend);
process.env.ROUMIX_PRUEBAS = '1'; // la auditoría marca estos registros como de prueba
process.env.SMTP_HOST = 'smtp.prueba.local'; process.env.SMTP_USER = 'x@prueba.local'; process.env.SMTP_PASS = 'x';

const db = require(path.join(backend, 'src/config/db'));
// Fotos simuladas: la prueba no toca Supabase Storage
const fotos = require(path.join(backend, 'src/services/fotosService'));
const borradas = [];
fotos.subirFotos = async () => [];
fotos.borrarFotos = async (_t, urls) => { borradas.push(...(urls || [])); };
const notificaciones = require(path.join(backend, 'src/services/notificacionesService'));
const correos = [];
notificaciones.usarTransporte({ sendMail: async (m) => { correos.push(m); } });
const adminCtrl = require(path.join(backend, 'src/controllers/adminController'));
const inm = require(path.join(backend, 'src/controllers/inmueblesController'));

let fallos = 0;
const ok = (c, t) => { if (!c) fallos++; console.log(`${c ? '✅' : '❌'} ${t}`); };
const res = () => { const r = { codigo: 200 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (j) => { r.cuerpo = j; return r; }; return r; };
const req = (usuario, extra = {}) => ({ usuario, token: 't', files: [], body: {}, query: {}, params: {}, protocol: 'https', get: () => 'roumix.prueba', ...extra });
async function falla(fn) { try { await fn(); return null; } catch (e) { return e; } }

const idPrueba = crypto.randomUUID();
const correoPrueba = `prueba-pub-${Date.now()}@roumix.test`;
const FOTO = 'https://prueba.local/foto-1.jpg';
let id = null;
const base = { titulo: 'Habitación de prueba módulo 2', tipo: 'habitacion', precio: 650000, barrio: 'Barzal', latitud: 4.13, longitud: -73.62, estrato: 3, fotosConservar: [FOTO] };

(async () => {
  try {
    await db.query(
      `INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
       VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(),
               '{"rol":"propietario","nombre":"Prueba Publicaciones"}', '{}', now(), now())`, [idPrueba, correoPrueba]);
    await db.query(`INSERT INTO verificaciones_propietario (propietario_id, estado) VALUES ($1, 'aprobado')
                    ON CONFLICT (propietario_id) DO UPDATE SET estado = 'aprobado'`, [idPrueba]);
    const prop = (await db.query('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = $1', [idPrueba])).rows[0];
    const admin = (await db.query("SELECT id, nombre, email, rol, estado FROM usuarios WHERE rol = 'admin' LIMIT 1")).rows[0];
    id = (await db.query(
      `INSERT INTO inmuebles (propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, latitud, longitud, imagen_principal, galeria, estado, moderacion)
       VALUES ($1, $2, 'habitacion', 'Habitación', 650000, 'Barzal', 'Santo Tomás', 4.13, -73.62, $3, ARRAY[$3], 'disponible', 'aprobada') RETURNING id`,
      [idPrueba, base.titulo, FOTO])).rows[0].id;
    ok(!!id, `Inmueble de prueba #${id} creado y aprobado`);

    // 1. Capacidad
    let e = await falla(() => inm.actualizarInmueble(req(prop, { params: { id }, body: { ...base, capacidad: 25 } }), res()));
    ok(e && e.status === 400 && /capacidad/.test(e.message), `Capacidad 25 → 400 ("${e && e.message}")`);
    e = await falla(() => inm.actualizarInmueble(req(prop, { params: { id }, body: { ...base, capacidad: 2.5 } }), res()));
    ok(e && e.status === 400, 'Capacidad 2.5 → 400');
    let r = res(); await inm.actualizarInmueble(req(prop, { params: { id }, body: { ...base, capacidad: 3 } }), r);
    ok(r.codigo === 200 && r.cuerpo.data.capacidad === 3, 'Capacidad 3 se guarda y vuelve en la respuesta');
    r = res(); await inm.getInmueblePorId(req(null, { params: { id } }), r);
    ok(r.codigo === 200 && r.cuerpo.data.capacidad === 3, 'El detalle público muestra la capacidad');
    let dbErr = await falla(() => db.query('UPDATE inmuebles SET capacidad = 0 WHERE id = $1', [id]));
    ok(dbErr && /capacidad_check/.test(dbErr.message), 'La BD rechaza capacidad 0 (CHECK)');

    // 2. "retirado" no se puede elegir con el selector de estado
    e = await falla(() => inm.cambiarEstado(req(prop, { params: { id }, body: { estado: 'retirado' } }), res()));
    ok(e && e.status === 400, 'PATCH estado=retirado → 400 (solo con "Retirar")');

    // 3. Pausa temporal del admin: oculta, sin resolver reportes
    await db.query(`INSERT INTO reportes (inmueble_id, reportante_id, motivo, descripcion) VALUES ($1, $2, 'otro', 'Reporte de prueba')`, [id, admin.id]);
    correos.length = 0;
    r = res(); await adminCtrl.moderarInmueble(req(admin, { params: { id }, body: { decision: 'pausar', justificacion: 'Revisión de prueba por reporte' } }), r);
    const tras = (await db.query('SELECT moderacion, estado FROM inmuebles WHERE id = $1', [id])).rows[0];
    ok(r.codigo === 200 && tras.moderacion === 'en_revision' && tras.estado === 'disponible', 'Pausar → moderación "en_revision", estado comercial intacto');
    const rep = (await db.query('SELECT estado FROM reportes WHERE inmueble_id = $1', [id])).rows[0];
    ok(rep.estado === 'pendiente', 'El reporte sigue "pendiente" tras la pausa');
    r = res(); await inm.getInmueblePorId(req(null, { params: { id } }), r);
    ok(r.codigo === 404, 'Pausada por Roumix: no aparece en el detalle público');
    ok(correos.some((c) => c.to === correoPrueba && /revisión/i.test(c.subject + (c.html || ''))), 'Correo al propietario: "Tu publicación está en revisión"');
    r = res(); await adminCtrl.moderarInmueble(req(admin, { params: { id }, body: { decision: 'aprobar', justificacion: 'Todo correcto en la revisión' } }), r);
    const rep2 = (await db.query('SELECT estado FROM reportes WHERE inmueble_id = $1', [id])).rows[0];
    ok(rep2.estado === 'no_procede', 'Al aprobar después, el reporte se resuelve como "no procede"');

    // 4. Retirar (antes era borrar)
    r = res(); await inm.eliminarInmueble(req(prop, { params: { id } }), r);
    const ret = (await db.query('SELECT estado, retirado_en, galeria FROM inmuebles WHERE id = $1', [id])).rows[0];
    ok(r.codigo === 200 && ret && ret.estado === 'retirado' && ret.retirado_en, 'Retirar → la fila se conserva con estado "retirado" y fecha');
    ok(ret.galeria.length === 1 && borradas.length === 0, 'Las fotos se conservan (no se borran de Storage)');
    const hist = (await db.query("SELECT 1 FROM moderacion_historial WHERE inmueble_id = $1 AND accion = 'retirada_por_propietario'", [id])).rowCount;
    ok(hist === 1, 'Queda en el historial: "retirada_por_propietario"');
    r = res(); await inm.getInmueblePorId(req(null, { params: { id } }), r);
    ok(r.codigo === 404, 'Retirada: no aparece en el detalle público');
    r = res(); await inm.getInmuebles(req(null), r);
    ok(!r.cuerpo.data.some((i) => i.id === id), 'Retirada: no aparece en la búsqueda');
    r = res(); await inm.getMisInmuebles(req(prop), r);
    ok(r.cuerpo.data.some((i) => i.id === id && i.estado === 'retirado'), 'Sigue en "Mis publicaciones" como registro');

    // 5. Una retirada ya no se toca
    r = res(); await inm.eliminarInmueble(req(prop, { params: { id } }), r);
    ok(r.codigo === 409, 'Retirar dos veces → 409');
    e = await falla(() => inm.actualizarInmueble(req(prop, { params: { id }, body: { ...base, capacidad: 4 } }), res()));
    ok(e && e.status === 409, 'Editar una retirada → 409');
    e = await falla(() => inm.cambiarEstado(req(prop, { params: { id }, body: { estado: 'disponible' } }), res()));
    ok(e && e.status === 409, 'Reactivar una retirada → 409');

    // 6. Otro propietario no puede retirar inmuebles ajenos
    r = res(); await inm.eliminarInmueble(req(admin, { params: { id } }), r);
    ok(r.codigo === 404, 'Retirar un inmueble ajeno → 404 (no revela nada)');

    // 7. Las publicaciones reales siguen visibles
    r = res(); await inm.getInmuebles(req(null), r);
    ok(r.cuerpo.data.length >= 1, `Búsqueda pública: ${r.cuerpo.data.length} publicación(es) reales visibles`);
  } catch (err) {
    fallos++; console.error('ERROR', err);
  } finally {
    if (id) {
      await db.query('DELETE FROM moderacion_historial WHERE inmueble_id = $1', [id]).catch(() => {});
      await db.query('DELETE FROM inmuebles WHERE id = $1', [id]);
    }
    await db.query('DELETE FROM moderacion_historial WHERE usuario_afectado_id = $1', [idPrueba]).catch(() => {});
    await db.query('DELETE FROM auth.users WHERE id = $1', [idPrueba]);
    const quedan = (await db.query('SELECT count(*)::int n FROM usuarios WHERE id = $1', [idPrueba])).rows[0].n;
    console.log(quedan === 0 ? '🧹 Datos de prueba borrados' : '⚠️ Quedó el usuario de prueba');
    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
    await db.query('DELETE FROM auditoria WHERE es_prueba').catch(() => {});
    process.exitCode = fallos ? 1 : 0;
    await db.pool.end();
  }
})();
