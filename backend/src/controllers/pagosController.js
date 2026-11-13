/**
 * Pagos SIMULADOS del primer canon, comisión, desembolsos, devoluciones y disputas.
 *
 * - El estudiante paga el canon completo SOLO cuando el contrato está formalizado.
 * - El "proveedor" es un simulador: el estudiante elige el resultado (aprobado o
 *   rechazado) para poder demostrar ambos casos. Nunca se mueve dinero real.
 * - Al aprobarse: comisión del 10 % (a cargo del propietario) + desembolso pendiente del 90 %.
 */
const db = require('../config/db');
const notificaciones = require('../services/notificacionesService');
const { crearAviso } = require('../services/avisosService');
const pagos = require('../services/pagosService');
const { auditar } = require('../services/auditoriaService');

const METODOS = { tarjeta_simulada: 'Tarjeta (simulada)', pse_simulado: 'PSE (simulado)', nequi_simulado: 'Nequi (simulado)' };
const MAX_INTENTOS = 5;

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function idEntero(valor, campo = 'id') {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorHttp(400, `${campo} no válido.`);
  return id;
}

function motivo(valor, campo = 'El motivo', min = 5) {
  const limpio = typeof valor === 'string' ? valor.trim() : '';
  if (limpio.length < min) throw errorHttp(400, `${campo} debe tener al menos ${min} caracteres.`);
  if (limpio.length > 500) throw errorHttp(400, `${campo} admite máximo 500 caracteres.`);
  return limpio;
}

async function enTransaccion(fn) {
  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

const SELECT_PAGO = `
  SELECT p.*, s.inmueble_titulo, s.estado AS solicitud_estado, c.fecha_inicio,
         d.estado AS desembolso_estado, d.referencia AS desembolso_referencia, d.realizado_en AS desembolso_realizado_en,
         co.estado AS comision_estado, co.version_condiciones,
         dv.referencia AS devolucion_referencia, dv.motivo AS devolucion_motivo, dv.created_at AS devolucion_en
  FROM pagos p
  JOIN solicitudes s ON s.id = p.solicitud_id
  JOIN contratos c ON c.id = p.contrato_id
  LEFT JOIN desembolsos d ON d.pago_id = p.id
  LEFT JOIN comisiones co ON co.pago_id = p.id
  LEFT JOIN devoluciones dv ON dv.pago_id = p.id`;

// El estudiante no necesita ver la comisión ni el desembolso del propietario
function vistaSegunRol(p, rol) {
  const { estudiante_id: _e, propietario_id: _p, ...resto } = p;
  if (rol === 'estudiante') {
    const { comision: _c, neto_propietario: _n, porcentaje_comision: _pc, desembolso_estado: _d, desembolso_referencia: _dr,
      desembolso_realizado_en: _dre, comision_estado: _ce, version_condiciones: _v, ...estudiante } = resto;
    return { ...estudiante, mi_rol: rol };
  }
  return { ...resto, mi_rol: rol };
}

async function cargarPago(id, usuario) {
  const { rows } = await db.query(`${SELECT_PAGO} WHERE p.id = $1`, [id]);
  const p = rows[0];
  if (usuario.rol === 'admin') {
    if (!p) throw errorHttp(404, `No existe el pago ${id}.`);
    return p;
  }
  const esParte = p && (usuario.rol === 'estudiante' ? p.estudiante_id : p.propietario_id) === usuario.id;
  if (!esParte) throw errorHttp(404, 'No tienes un pago con ese número.');
  return p;
}

// ============================================================================
// Partes (estudiante y propietario)
// ============================================================================

/** GET /api/pagos/mios */
async function misPagos(req, res) {
  const columna = req.usuario.rol === 'estudiante' ? 'estudiante_id' : 'propietario_id';
  const { rows } = await db.query(`${SELECT_PAGO} WHERE p.${columna} = $1 ORDER BY p.updated_at DESC`, [req.usuario.id]);
  res.json({ status: 'success', simulado: true, data: rows.map((p) => vistaSegunRol(p, req.usuario.rol)) });
}

/** GET /api/pagos/:id */
async function verPago(req, res) {
  const id = idEntero(req.params.id);
  const p = await cargarPago(id, req.usuario);
  const { rows: eventos } = await db.query(
    `SELECT tipo, referencia, monto, detalle, autor_rol, created_at FROM pagos_eventos WHERE pago_id = $1 ORDER BY created_at, id`,
    [id]
  );
  const visibles = req.usuario.rol === 'estudiante'
    ? eventos.filter((e) => e.tipo !== 'desembolso_realizado').map((e) => (e.tipo === 'habilitado' ? { ...e, monto: p.monto } : e))
    : eventos;
  res.json({ status: 'success', simulado: true, data: { ...vistaSegunRol(p, req.usuario.rol), eventos: visibles, metodos: METODOS } });
}

/**
 * POST /api/pagos/:id/simular  { metodo, resultado: 'aprobado' | 'rechazado' }
 * El estudiante "paga" el primer canon con el simulador.
 */
async function simularPago(req, res) {
  const id = idEntero(req.params.id);
  const body = req.body || {};
  if (!METODOS[body.metodo]) throw errorHttp(400, 'Elige un método de pago simulado.');
  if (!['aprobado', 'rechazado'].includes(body.resultado)) throw errorHttp(400, 'Elige el resultado que quieres simular.');
  const aprobado = body.resultado === 'aprobado';

  const resultado = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT p.*, c.estado AS contrato_estado, s.estado AS solicitud_estado, s.inmueble_titulo, v.version_condiciones
       FROM pagos p
       JOIN contratos c ON c.id = p.contrato_id
       JOIN solicitudes s ON s.id = p.solicitud_id
       LEFT JOIN verificaciones_propietario v ON v.propietario_id = p.propietario_id
       WHERE p.id = $1 FOR UPDATE OF p`,
      [id]
    );
    const p = rows[0];
    if (!p || p.estudiante_id !== req.usuario.id) throw errorHttp(404, 'No tienes un pago con ese número.');
    // Nunca se paga antes de formalizar el contrato
    if (p.contrato_estado !== 'formalizado') throw errorHttp(409, 'El contrato todavía no está formalizado.');
    if (!['pendiente', 'fallido'].includes(p.estado)) throw errorHttp(409, 'Este pago ya no está pendiente.');
    if (p.solicitud_estado !== 'pago_pendiente') throw errorHttp(409, 'La solicitud no está esperando el pago.');
    if (p.intentos >= MAX_INTENTOS) throw errorHttp(429, 'Superaste el número de intentos. Escríbele al equipo de Roumix.');

    const ref = pagos.referencia('SIM');
    if (!aprobado) {
      await cliente.query(
        `UPDATE pagos SET estado = 'fallido', intentos = intentos + 1, metodo = $2, ultimo_error = $3 WHERE id = $1`,
        [id, body.metodo, 'El simulador rechazó la transacción (fondos insuficientes simulados).']
      );
      await pagos.registrarEvento(cliente, {
        pagoId: id, tipo: 'intento_rechazado', referencia: ref, monto: p.monto,
        detalle: `${METODOS[body.metodo]}: rechazado por el simulador.`, autorId: req.usuario.id, autorRol: 'estudiante'
      });
      await auditar({ actor: req.usuario, accion: 'pago_rechazado', entidad: 'pago', entidadId: id,
        resumen: `Intento rechazado por el simulador (${ref}).`, datos: { metodo: body.metodo, monto: p.monto, simulado: true }, ip: req.ip }, cliente);
      return { p, aprobado: false, ref };
    }

    await cliente.query(
      `UPDATE pagos SET estado = 'aprobado', intentos = intentos + 1, metodo = $2, referencia = $3, aprobado_en = now(), ultimo_error = NULL WHERE id = $1`,
      [id, body.metodo, ref]
    );
    await pagos.registrarEvento(cliente, {
      pagoId: id, tipo: 'intento_aprobado', referencia: ref, monto: p.monto,
      detalle: `${METODOS[body.metodo]}: aprobado por el simulador.`, autorId: req.usuario.id, autorRol: 'estudiante'
    });
    // Comisión del 10 % respaldada por la versión de condiciones que aceptó el propietario
    await cliente.query(
      `INSERT INTO comisiones (pago_id, propietario_id, monto, porcentaje, version_condiciones) VALUES ($1, $2, $3, $4, $5)`,
      [id, p.propietario_id, p.comision, p.porcentaje_comision, p.version_condiciones || pagos.VERSION_CONDICIONES]
    );
    await cliente.query(
      `INSERT INTO desembolsos (pago_id, propietario_id, monto) VALUES ($1, $2, $3)`,
      [id, p.propietario_id, p.neto_propietario]
    );
    await pagos.moverSolicitud(cliente, {
      solicitudId: p.solicitud_id, de: 'pago_pendiente', a: 'pagado',
      notaEstudiante: `Roumix confirmó tu pago del primer mes (referencia ${ref}, pago demostrativo).`,
      notaPropietario: 'El estudiante pagó el primer mes. Roumix gestionará tu desembolso.',
      notaInterna: `Pago #${id} aprobado (${ref}). Comisión ${p.comision}, desembolso pendiente ${p.neto_propietario}.`
    });
    await auditar({ actor: req.usuario, accion: 'pago_aprobado', entidad: 'pago', entidadId: id,
      resumen: `Pago del primer canon aprobado por el simulador (${ref}).`,
      datos: { metodo: body.metodo, monto: p.monto, comision: p.comision, neto_propietario: p.neto_propietario, simulado: true }, ip: req.ip }, cliente);
    return { p, aprobado: true, ref };
  });

  const { p, ref } = resultado;
  const urlBase = notificaciones.urlBase(req);
  if (resultado.aprobado) {
    await crearAviso({ usuarioId: p.estudiante_id, tipo: 'solicitud', titulo: 'Pago confirmado (simulado)', cuerpo: `${p.inmueble_titulo} · ${ref}`, enlace: `pago.html?id=${id}` });
    await crearAviso({ usuarioId: p.propietario_id, tipo: 'solicitud', titulo: 'El estudiante pagó el primer mes', cuerpo: p.inmueble_titulo, enlace: `pago.html?id=${id}` });
    await notificaciones.notificarPago({ pago: { ...p, referencia: ref }, evento: 'aprobado', urlBase });
  }
  res.json({
    status: 'success',
    simulado: true,
    message: resultado.aprobado
      ? `Pago aprobado (simulado). Referencia ${ref}.`
      : 'El simulador rechazó el pago. Puedes intentarlo de nuevo.',
    data: { id, estado: resultado.aprobado ? 'aprobado' : 'fallido', referencia: resultado.aprobado ? ref : null }
  });
}

/** POST /api/pagos/:id/disputa  { motivo } — el estudiante reporta un problema con un pago aprobado */
async function abrirDisputa(req, res) {
  const id = idEntero(req.params.id);
  const texto = motivo((req.body || {}).motivo, 'La descripción del problema', 10);
  const p = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT p.*, d.estado AS desembolso_estado, s.inmueble_titulo FROM pagos p
       LEFT JOIN desembolsos d ON d.pago_id = p.id JOIN solicitudes s ON s.id = p.solicitud_id
       WHERE p.id = $1 FOR UPDATE OF p`,
      [id]
    );
    const pago = rows[0];
    if (!pago || pago.estudiante_id !== req.usuario.id) throw errorHttp(404, 'No tienes un pago con ese número.');
    if (pago.estado !== 'aprobado') throw errorHttp(409, 'Solo se puede reportar un problema de un pago aprobado.');
    if (pago.desembolso_estado === 'realizado') throw errorHttp(409, 'El dinero ya se entregó al propietario. Escríbele al equipo de Roumix.');
    await cliente.query("UPDATE pagos SET estado = 'en_disputa' WHERE id = $1", [id]);
    await cliente.query("UPDATE desembolsos SET estado = 'retenido', nota = 'Retenido por disputa del estudiante.' WHERE pago_id = $1", [id]);
    await pagos.registrarEvento(cliente, { pagoId: id, tipo: 'disputa_abierta', detalle: texto, autorId: req.usuario.id, autorRol: 'estudiante' });
    await auditar({ actor: req.usuario, accion: 'disputa_abierta', entidad: 'pago', entidadId: id, resumen: 'El estudiante reportó un problema; desembolso retenido.', ip: req.ip }, cliente);
    return pago;
  });
  await notificaciones.notificarPago({ pago: p, evento: 'disputa', detalle: texto, urlBase: notificaciones.urlBase(req) });
  res.json({ status: 'success', message: 'Reportaste el problema. Roumix retuvo el desembolso al propietario mientras lo revisa.' });
}

// ============================================================================
// Administración
// ============================================================================

/** GET /api/admin/pagos?estado= */
async function listarAdmin(req, res) {
  const estado = String(req.query.estado || 'todos');
  const filtros = {
    todos: 'TRUE',
    por_desembolsar: "p.estado = 'aprobado' AND d.estado = 'pendiente'",
    pendiente: "p.estado IN ('pendiente', 'fallido')",
    aprobado: "p.estado = 'aprobado'",
    en_disputa: "p.estado = 'en_disputa'",
    reembolsado: "p.estado = 'reembolsado'",
    cancelado: "p.estado = 'cancelado'"
  };
  if (!filtros[estado]) throw errorHttp(400, 'Filtro de estado no válido.');
  const [lista, totales, sinCondiciones] = await Promise.all([
    db.query(
      `${SELECT_PAGO.replace('SELECT p.*,', `SELECT p.*, e.nombre AS estudiante_nombre, pr.nombre AS propietario_nombre,`)}
       LEFT JOIN usuarios e ON e.id = p.estudiante_id
       LEFT JOIN usuarios pr ON pr.id = p.propietario_id
       WHERE ${filtros[estado]} ORDER BY p.updated_at DESC LIMIT 200`
    ),
    db.query(`SELECT
        COALESCE(sum(p.monto) FILTER (WHERE p.estado IN ('aprobado', 'en_disputa')), 0)::bigint AS recaudado,
        COALESCE((SELECT sum(monto) FROM comisiones WHERE estado = 'registrada'), 0)::bigint AS comisiones,
        COALESCE((SELECT sum(monto) FROM desembolsos WHERE estado IN ('pendiente', 'retenido')), 0)::bigint AS por_desembolsar,
        COALESCE((SELECT sum(monto) FROM desembolsos WHERE estado = 'realizado'), 0)::bigint AS desembolsado,
        COALESCE((SELECT sum(monto) FROM devoluciones), 0)::bigint AS devuelto
      FROM pagos p`),
    db.query(`SELECT s.id, s.inmueble_titulo, u.nombre AS propietario_nombre
      FROM solicitudes s JOIN contratos c ON c.solicitud_id = s.id AND c.estado = 'formalizado'
      LEFT JOIN usuarios u ON u.id = s.propietario_id
      LEFT JOIN verificaciones_propietario v ON v.propietario_id = s.propietario_id
      WHERE s.estado = 'contrato_formalizado' AND NOT COALESCE(v.acepta_comision, false)`)
  ]);
  const t = totales.rows[0];
  res.json({
    status: 'success',
    simulado: true,
    totales: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)])),
    esperandoCondiciones: sinCondiciones.rows,
    data: lista.rows
  });
}

/** GET /api/admin/pagos/:id */
async function detalleAdmin(req, res) {
  return verPago(req, res);
}

/** POST /api/admin/solicitudes/:id/pago — vuelve a intentar habilitar el pago */
async function habilitarAdmin(req, res) {
  const solicitudId = idEntero(req.params.id);
  const r = await enTransaccion((cliente) => pagos.habilitarPago(cliente, solicitudId));
  if (!r.habilitado) {
    const mensajes = {
      sin_contrato: 'La solicitud no tiene un contrato formalizado.',
      estado: 'La solicitud no está en "Contrato formalizado".',
      comision_no_aceptada: 'El propietario todavía no ha aceptado las condiciones de la comisión. Se le recordó en la plataforma.'
    };
    if (r.motivo === 'comision_no_aceptada') {
      const { rows } = await db.query('SELECT propietario_id FROM solicitudes WHERE id = $1', [solicitudId]);
      await crearAviso({ usuarioId: rows[0] && rows[0].propietario_id, tipo: 'verificacion', titulo: 'Acepta las condiciones de la comisión', cuerpo: 'Es necesario para habilitar el pago del estudiante.', enlace: 'verificacion.html' });
    }
    throw errorHttp(409, mensajes[r.motivo]);
  }
  await avisarPagoHabilitado(r, notificaciones.urlBase(req));
  res.json({ status: 'success', message: `Pago #${r.pagoId} habilitado. El estudiante ya puede pagar.`, data: { id: r.pagoId } });
}

async function avisarPagoHabilitado(r, urlBase) {
  await crearAviso({ usuarioId: r.estudianteId, tipo: 'solicitud', titulo: 'Ya puedes pagar el primer mes', cuerpo: 'Pago demostrativo a través de Roumix.', enlace: `pago.html?id=${r.pagoId}` });
  await notificaciones.notificarPago({ pago: { id: r.pagoId, estudiante_id: r.estudianteId }, evento: 'habilitado', urlBase });
}

/** POST /api/admin/pagos/:id/desembolso  { referencia? } — registra el desembolso (simulado) al propietario */
async function registrarDesembolso(req, res) {
  const id = idEntero(req.params.id);
  const p = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT p.*, d.estado AS desembolso_estado FROM pagos p JOIN desembolsos d ON d.pago_id = p.id WHERE p.id = $1 FOR UPDATE OF p`,
      [id]
    );
    const pago = rows[0];
    if (!pago) throw errorHttp(404, `No existe un pago aprobado con el número ${id}.`);
    if (pago.estado !== 'aprobado' || pago.desembolso_estado !== 'pendiente') {
      throw errorHttp(409, 'Solo se desembolsa un pago aprobado, sin disputa y con el desembolso pendiente.');
    }
    const ref = pagos.referencia('DSB');
    await cliente.query("UPDATE desembolsos SET estado = 'realizado', referencia = $2, realizado_en = now(), nota = 'Desembolso simulado.' WHERE pago_id = $1", [id, ref]);
    await pagos.registrarEvento(cliente, { pagoId: id, tipo: 'desembolso_realizado', referencia: ref, monto: pago.neto_propietario, detalle: 'Desembolso simulado al propietario.', autorId: req.usuario.id, autorRol: 'admin' });
    await pagos.moverSolicitud(cliente, {
      solicitudId: pago.solicitud_id, de: 'pagado', a: 'completada',
      notaEstudiante: '¡Proceso completado! Bienvenido a tu nuevo hogar.',
      notaPropietario: `Roumix registró tu desembolso (referencia ${ref}, simulado). El proceso terminó.`,
      notaInterna: `Desembolso del pago #${id} realizado (${ref}).`
    });
    return { ...pago, referenciaDesembolso: ref };
  });
  await crearAviso({ usuarioId: p.propietario_id, tipo: 'solicitud', titulo: 'Desembolso registrado (simulado)', cuerpo: `${p.neto_propietario.toLocaleString('es-CO')} COP · ${p.referenciaDesembolso}`, enlace: `pago.html?id=${id}` });
  await notificaciones.notificarPago({ pago: p, evento: 'desembolso', urlBase: notificaciones.urlBase(req) });
  res.json({ status: 'success', message: `Desembolso registrado (${p.referenciaDesembolso}). La solicitud quedó completada.` });
}

/** POST /api/admin/pagos/:id/devolucion  { motivo } — devuelve el pago al estudiante (simulado) */
async function registrarDevolucion(req, res) {
  const id = idEntero(req.params.id);
  const texto = motivo((req.body || {}).motivo);
  const p = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT p.*, d.estado AS desembolso_estado FROM pagos p LEFT JOIN desembolsos d ON d.pago_id = p.id WHERE p.id = $1 FOR UPDATE OF p`,
      [id]
    );
    const pago = rows[0];
    if (!pago) throw errorHttp(404, `No existe el pago ${id}.`);
    if (!['aprobado', 'en_disputa'].includes(pago.estado)) throw errorHttp(409, 'Solo se devuelve un pago aprobado o en disputa.');
    if (pago.desembolso_estado === 'realizado') {
      throw errorHttp(409, 'El desembolso al propietario ya se hizo: la devolución debe gestionarse por fuera de este flujo.');
    }
    const ref = pagos.referencia('DEV');
    await cliente.query("UPDATE pagos SET estado = 'reembolsado', cerrado_en = now() WHERE id = $1", [id]);
    await cliente.query("UPDATE comisiones SET estado = 'anulada', anulada_en = now() WHERE pago_id = $1", [id]);
    await cliente.query("UPDATE desembolsos SET estado = 'anulado', nota = 'Anulado por devolución al estudiante.' WHERE pago_id = $1", [id]);
    await cliente.query(
      'INSERT INTO devoluciones (pago_id, monto, motivo, referencia, autor_id) VALUES ($1, $2, $3, $4, $5)',
      [id, pago.monto, texto, ref, req.usuario.id]
    );
    await pagos.registrarEvento(cliente, { pagoId: id, tipo: 'devolucion', referencia: ref, monto: pago.monto, detalle: texto, autorId: req.usuario.id, autorRol: 'admin' });
    if (pago.estado === 'en_disputa') {
      await pagos.registrarEvento(cliente, { pagoId: id, tipo: 'disputa_resuelta', detalle: 'Resuelta con devolución al estudiante.', autorId: req.usuario.id, autorRol: 'admin' });
    }
    await pagos.moverSolicitud(cliente, {
      solicitudId: pago.solicitud_id, de: 'pagado', a: 'cancelada',
      notaEstudiante: `Roumix te devolvió el pago (referencia ${ref}, simulado). Motivo: ${texto}`,
      notaPropietario: 'El arriendo no siguió adelante: Roumix devolvió el pago al estudiante y la comisión quedó anulada.',
      notaInterna: `Devolución del pago #${id} (${ref}): ${texto}`
    });
    return { ...pago, referenciaDevolucion: ref };
  });
  await crearAviso({ usuarioId: p.estudiante_id, tipo: 'solicitud', titulo: 'Devolución registrada (simulada)', cuerpo: p.referenciaDevolucion, enlace: `pago.html?id=${id}` });
  await crearAviso({ usuarioId: p.propietario_id, tipo: 'solicitud', titulo: 'El pago fue devuelto al estudiante', cuerpo: texto, enlace: 'solicitudes.html' });
  await notificaciones.notificarPago({ pago: p, evento: 'devolucion', detalle: texto, urlBase: notificaciones.urlBase(req) });
  res.json({ status: 'success', message: `Devolución registrada (${p.referenciaDevolucion}). La comisión y el desembolso quedaron anulados.` });
}

/** POST /api/admin/pagos/:id/resolver-disputa  { nota } — cierra la disputa sin devolución */
async function resolverDisputa(req, res) {
  const id = idEntero(req.params.id);
  const nota = motivo((req.body || {}).nota, 'La explicación');
  const p = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query("SELECT * FROM pagos WHERE id = $1 AND estado = 'en_disputa' FOR UPDATE", [id]);
    if (!rows.length) throw errorHttp(409, 'Este pago no tiene una disputa abierta.');
    await cliente.query("UPDATE pagos SET estado = 'aprobado' WHERE id = $1", [id]);
    await cliente.query("UPDATE desembolsos SET estado = 'pendiente', nota = NULL WHERE pago_id = $1 AND estado = 'retenido'", [id]);
    await pagos.registrarEvento(cliente, { pagoId: id, tipo: 'disputa_resuelta', detalle: `Sin devolución: ${nota}`, autorId: req.usuario.id, autorRol: 'admin' });
    await cliente.query(
      `INSERT INTO solicitudes_historial (solicitud_id, autor_id, autor_rol, nota_estudiante, nota_interna) VALUES ($1, $2, 'admin', $3, $4)`,
      [rows[0].solicitud_id, req.usuario.id, `Roumix revisó el problema que reportaste con el pago: ${nota}`, `Disputa del pago #${id} cerrada sin devolución.`]
    );
    return rows[0];
  });
  await crearAviso({ usuarioId: p.estudiante_id, tipo: 'solicitud', titulo: 'Roumix revisó tu reporte del pago', cuerpo: nota, enlace: `pago.html?id=${id}` });
  res.json({ status: 'success', message: 'Disputa cerrada sin devolución. El desembolso volvió a quedar pendiente.' });
}

/** POST /api/admin/pagos/:id/cancelar  { motivo } — cancela un pago que aún no se ha hecho */
async function cancelarAdmin(req, res) {
  const id = idEntero(req.params.id);
  const texto = motivo((req.body || {}).motivo);
  const p = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query("SELECT * FROM pagos WHERE id = $1 AND estado IN ('pendiente', 'fallido') FOR UPDATE", [id]);
    if (!rows.length) throw errorHttp(409, 'Solo se cancela un pago que todavía no se ha hecho.');
    await cliente.query("UPDATE pagos SET estado = 'cancelado', cerrado_en = now() WHERE id = $1", [id]);
    await pagos.registrarEvento(cliente, { pagoId: id, tipo: 'cancelado', detalle: texto, autorId: req.usuario.id, autorRol: 'admin' });
    await pagos.moverSolicitud(cliente, {
      solicitudId: rows[0].solicitud_id, de: 'pago_pendiente', a: 'cancelada',
      notaEstudiante: `El pago se canceló y el proceso se cerró. Motivo: ${texto}`,
      notaPropietario: 'El proceso de arriendo se cerró antes del pago.',
      notaInterna: `Pago #${id} cancelado: ${texto}`
    });
    return rows[0];
  });
  await crearAviso({ usuarioId: p.estudiante_id, tipo: 'solicitud', titulo: 'El pago fue cancelado', cuerpo: texto, enlace: 'solicitudes.html' });
  res.json({ status: 'success', message: `Pago #${id} cancelado y solicitud cerrada.` });
}

module.exports = {
  METODOS,
  misPagos,
  verPago,
  simularPago,
  abrirDisputa,
  listarAdmin,
  detalleAdmin,
  habilitarAdmin,
  avisarPagoHabilitado,
  registrarDesembolso,
  registrarDevolucion,
  resolverDisputa,
  cancelarAdmin
};
