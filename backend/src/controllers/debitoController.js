/**
 * Débito automático mensual (W-5b): Roumix cobra con Wompi los meses 2 en adelante.
 *
 * Estudiante:
 *   GET    /api/pagos/:id/debito/preparar → datos para activar (términos de Wompi, llave pública, plan de cobros)
 *   POST   /api/pagos/:id/debito          → activa con la tarjeta o el Nequi ya tokenizados en el navegador
 *   DELETE /api/pagos/:id/debito          → desactiva (los cobros futuros se cancelan)
 * Sistema:
 *   procesarCobros() → lo llama la tarea diaria: cobra los meses que vencen y reintenta los fallidos
 *   aplicarCobro()   → aplica el resultado que informa Wompi (webhook o consulta)
 * Administración:
 *   GET  /api/admin/cobros?estado=        POST /api/admin/cobros/procesar
 *   POST /api/admin/cobros/:id/desembolso
 *
 * Reglas:
 *   - Solo con el primer mes PAGADO, contrato formalizado y el propietario con las condiciones vigentes.
 *   - Comisión de cada mes según PORCENTAJE_COMISION_MENSUAL (10 % desde la versión 2027-01, a cargo del
 *     propietario); el resto queda como desembolso pendiente. Cada débito guarda el porcentaje con el que se activó.
 *   - Si un cobro falla: 3 intentos en 3 días (día 0, +1, +3). Sin recargos de Roumix.
 *   - Roumix guarda solo el id de la fuente de pago de Wompi y una descripción ("Visa •••• 4242").
 */
const crypto = require('crypto');
const db = require('../config/db');
const wompi = require('../services/wompiService');
const pagos = require('../services/pagosService');
const verificacion = require('../services/verificacionService');
const notificaciones = require('../services/notificacionesService');
const { crearAviso } = require('../services/avisosService');
const { auditar } = require('../services/auditoriaService');

const MAX_INTENTOS_COBRO = 3;
const ESPERA_REINTENTO = { 1: 1, 2: 2 };   // días tras el 1.º y el 2.º fallo
const PORCENTAJE = verificacion.PORCENTAJE_COMISION_MENSUAL;

function errorHttp(status, message) {
  return Object.assign(new Error(message), { status });
}

function idEntero(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorHttp(400, 'Número de pago no válido.');
  return id;
}

async function enTransaccion(fn) {
  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// ---------- Fechas del calendario (texto AAAA-MM-DD, hora de Colombia) ----------
const hoyBogota = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
function partes(iso) { const [a, m, d] = iso.split('-').map(Number); return { a, m, d }; }
function aISO(fecha) { return fecha.toISOString().slice(0, 10); }
// Suma meses sin "desbordar": 31 de enero + 1 mes = 28 (o 29) de febrero, no 3 de marzo
function sumarMeses(iso, meses, dias = 0) {
  const { a, m, d } = partes(iso);
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  return aISO(new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo) + dias)));
}
const sumarDias = (iso, dias) => sumarMeses(iso, 0, dias);
function conDia(iso, dia) {
  const { a, m } = partes(iso);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return aISO(new Date(Date.UTC(a, m - 1, Math.min(dia, ultimo))));
}

/**
 * Meses que se cobrarían por débito desde hoy.
 * Mes k (2..N): empieza en inicio + (k-1) meses y se cobra el primer "día de pago" del contrato que
 * cae DENTRO de ese periodo (nunca antes de que empiece el mes que se paga).
 * Si esa fecha ya pasó pero el periodo sigue vigente, se cobra mañana.
 */
function calcularPlan(contrato, hoy = hoyBogota()) {
  const plan = [];
  const manana = sumarDias(hoy, 1);
  const { comision, neto } = repartir(contrato.canon_mensual);
  for (let k = 2; k <= contrato.duracion_meses; k++) {
    const periodoInicio = sumarMeses(contrato.inicio, k - 1);
    const periodoFin = sumarMeses(contrato.inicio, k, -1);
    if (periodoFin < manana) continue;                          // ese mes ya terminó
    let fechaCobro = conDia(periodoInicio, contrato.dia_pago);
    if (fechaCobro < periodoInicio) fechaCobro = conDia(sumarMeses(periodoInicio.slice(0, 8) + '01', 1), contrato.dia_pago);
    if (fechaCobro < manana) fechaCobro = manana;
    plan.push({ numeroMes: k, periodoInicio, periodoFin, fechaCobro, monto: contrato.canon_mensual, comision, neto });
  }
  return plan;
}

function repartir(monto) {
  const comision = Math.round((monto * PORCENTAJE) / 100);
  return { comision, neto: monto - comision };
}

// ---------- Datos del pago, el contrato y el débito ----------
const SELECT_CONTEXTO = `
  SELECT p.id AS pago_id, p.estado AS pago_estado, p.estudiante_id, p.propietario_id, p.contrato_id,
         c.estado AS contrato_estado, c.canon_mensual, c.duracion_meses, c.dia_pago, to_char(c.fecha_inicio, 'YYYY-MM-DD') AS inicio,
         s.inmueble_titulo, v.acepta_comision, v.version_condiciones
  FROM pagos p
  JOIN contratos c ON c.id = p.contrato_id
  JOIN solicitudes s ON s.id = p.solicitud_id
  LEFT JOIN verificaciones_propietario v ON v.propietario_id = p.propietario_id
  WHERE p.id = $1`;

/** ¿Se puede activar el débito para este pago? { ok, motivo, mensaje } */
function elegibilidad(ctx, plan, { reemplazo = false } = {}) {
  if (ctx.contrato_estado !== 'formalizado') return { ok: false, motivo: 'contrato', mensaje: 'El contrato no está formalizado.' };
  if (ctx.pago_estado !== 'aprobado') return { ok: false, motivo: 'primer_mes', mensaje: 'Primero se paga el primer mes; después activas el débito automático.' };
  if (ctx.duracion_meses < 2) return { ok: false, motivo: 'un_mes', mensaje: 'Tu contrato es de un solo mes: no hay meses siguientes por cobrar.' };
  // Cambiar el medio de un débito activo no depende de la versión de las condiciones: los cobros conservan las suyas
  if (reemplazo) return { ok: true };
  if (!(ctx.acepta_comision && ctx.version_condiciones === verificacion.VERSION_CONDICIONES)) {
    return { ok: false, motivo: 'propietario', mensaje: 'Disponible cuando el propietario acepte las condiciones nuevas de Roumix. Ya le avisamos.' };
  }
  if (!plan.length) return { ok: false, motivo: 'sin_meses', mensaje: 'No quedan meses por cobrar en tu contrato.' };
  return { ok: true };
}

/** Lo que la página de pago muestra sobre el débito (según el rol). */
async function resumenParaPago(pagoId, usuario) {
  const { rows: [ctx] } = await db.query(SELECT_CONTEXTO, [pagoId]);
  if (!ctx) return null;
  const cfg = wompi.configDebito();
  const { rows: [debito] } = await db.query(
    `SELECT id, estado, metodo, fuente_descripcion, created_at, cancelado_en FROM debitos_automaticos
     WHERE contrato_id = $1 ORDER BY (estado = 'activo') DESC, id DESC LIMIT 1`, [ctx.contrato_id]);
  const { rows: cobros } = await db.query(
    `SELECT id, numero_mes, to_char(periodo_inicio, 'YYYY-MM-DD') AS periodo_inicio, to_char(fecha_cobro, 'YYYY-MM-DD') AS fecha_cobro,
            to_char(proximo_intento, 'YYYY-MM-DD') AS proximo_intento, monto, comision, neto_propietario, estado, intentos,
            referencia, ultimo_error, aprobado_en, desembolso_estado
     FROM cobros_mensuales WHERE contrato_id = $1 AND estado <> 'cancelado' ORDER BY numero_mes`, [ctx.contrato_id]);
  const pendientesDeProgramar = calcularPlan(ctx).filter((m) => !cobros.some((c) => c.numero_mes === m.numeroMes));
  const eleg = elegibilidad(ctx, pendientesDeProgramar);
  const verComision = usuario.rol !== 'estudiante';
  const activo = Boolean(debito && debito.estado === 'activo');
  // Obligatorio por contrato cuando hay meses siguientes por cobrar
  const obligatorio = ctx.duracion_meses >= 2;
  return {
    porcentaje: PORCENTAJE,
    obligatorio,
    pendiente: obligatorio && !activo && ctx.pago_estado === 'aprobado' && pendientesDeProgramar.length > 0,
    puedeCambiar: Boolean(cfg.debito && activo),
    disponible: Boolean(cfg.debito && eleg.ok),
    motivo: !cfg.debito ? 'pasarela' : (eleg.ok ? null : eleg.motivo),
    mensaje: !cfg.debito ? 'El débito automático todavía no está habilitado en Roumix.' : (eleg.mensaje || null),
    activo: debito && debito.estado === 'activo'
      ? { metodo: debito.metodo, descripcion: debito.fuente_descripcion, desde: debito.created_at } : null,
    cobros: cobros.map((c) => verComision ? c : (({ comision: _c, neto_propietario: _n, desembolso_estado: _d, ...resto }) => resto)(c)),
    plan: debito && debito.estado === 'activo' ? [] : pendientesDeProgramar.map((m) => (verComision ? m : { ...m, comision: undefined, neto: undefined })),
    diaPago: ctx.dia_pago
  };
}

// ============================================================================
// Estudiante
// ============================================================================

async function contextoDelEstudiante(cliente, pagoId, usuario, { bloquear = false } = {}) {
  const { rows: [ctx] } = await cliente.query(`${SELECT_CONTEXTO}${bloquear ? ' FOR UPDATE OF p' : ''}`, [pagoId]);
  if (!ctx || ctx.estudiante_id !== usuario.id) throw errorHttp(404, 'No tienes un pago con ese número.');
  return ctx;
}

/** GET /api/pagos/:id/debito/preparar */
async function preparar(req, res) {
  const cfg = wompi.configDebito();
  if (!cfg.debito) throw errorHttp(503, 'El débito automático todavía no está habilitado en Roumix.');
  const id = idEntero(req.params.id);
  const ctx = await contextoDelEstudiante(db, id, req.usuario);
  const plan = calcularPlan(ctx);
  const reemplazo = await tieneDebitoActivo(db, ctx.contrato_id);
  const eleg = elegibilidad(ctx, plan, { reemplazo });
  if (!eleg.ok) throw errorHttp(409, eleg.mensaje);
  const terminos = await wompi.obtenerAceptacion(cfg);
  res.json({
    status: 'success',
    data: {
      llavePublica: cfg.publica,
      apiWompi: cfg.api,               // el navegador tokeniza directo con Wompi (la tarjeta nunca pasa por Roumix)
      modo: cfg.modo,
      ...terminos,
      plan: plan.map(({ comision: _c, neto: _n, ...m }) => m),
      correo: req.usuario.email
    }
  });
}

const DESCRIPCION_SEGURA = /^[\p{L}\d •*.-]{3,40}$/u;

async function tieneDebitoActivo(cliente, contratoId) {
  const { rows } = await cliente.query("SELECT 1 FROM debitos_automaticos WHERE contrato_id = $1 AND estado = 'activo'", [contratoId]);
  return rows.length > 0;
}

/** POST /api/pagos/:id/debito  { tipo: 'CARD'|'NEQUI', token, aceptacion, datosPersonales, acepto: true, descripcion } */
async function activar(req, res) {
  const cfg = wompi.configDebito();
  if (!cfg.debito) throw errorHttp(503, 'El débito automático todavía no está habilitado en Roumix.');
  const id = idEntero(req.params.id);
  const b = req.body || {};
  if (b.acepto !== true) throw errorHttp(400, 'Debes aceptar los términos de Wompi y la autorización de datos para activar el débito.');
  if (!['CARD', 'NEQUI'].includes(b.tipo)) throw errorHttp(400, 'Elige tarjeta o Nequi.');
  if (!/^[\w-]{6,120}$/.test(String(b.token || ''))) throw errorHttp(400, 'El medio de pago no se guardó bien. Intenta de nuevo.');
  if (!String(b.aceptacion || '').trim()) throw errorHttp(400, 'Faltan los términos de aceptación de Wompi.');

  // Validación previa (sin bloquear) para no crear una fuente de pago que no se usará
  // Si ya hay un débito activo, el medio nuevo lo REEMPLAZA (el débito es obligatorio: no se apaga, se cambia)
  const ctx0 = await contextoDelEstudiante(db, id, req.usuario);
  const eleg0 = elegibilidad(ctx0, calcularPlan(ctx0), { reemplazo: await tieneDebitoActivo(db, ctx0.contrato_id) });
  if (!eleg0.ok) throw errorHttp(409, eleg0.mensaje);

  // La fuente se crea en Wompi con la llave privada (servidor). Roumix guarda solo su id.
  const fuente = await wompi.crearFuentePago({
    tipo: b.tipo, token: b.token, correo: req.usuario.email, aceptacion: b.aceptacion, datosPersonales: b.datosPersonales || null
  }, cfg);
  if (!fuente || !fuente.id) throw errorHttp(502, 'Wompi no pudo guardar tu medio de pago. Intenta de nuevo.');
  if (fuente.status && fuente.status !== 'AVAILABLE') {
    throw errorHttp(422, fuente.status === 'PENDING'
      ? 'Tu banco o Nequi todavía no confirma el medio de pago. Apruébalo y vuelve a intentarlo.'
      : 'Wompi no aprobó este medio de pago. Prueba con otro.');
  }
  const publico = fuente.public_data || {};
  const metodo = b.tipo === 'CARD' ? 'tarjeta' : 'nequi';
  let descripcion = metodo === 'tarjeta'
    ? `${publico.brand || publico.type_card || 'Tarjeta'} •••• ${publico.last_four || ''}`.trim()
    : `Nequi •••• ${String(publico.phone_number || '').slice(-4)}`.trim();
  if (/•••• ?$/.test(descripcion) && DESCRIPCION_SEGURA.test(String(b.descripcion || ''))) descripcion = String(b.descripcion);

  const r = await enTransaccion(async (cliente) => {
    const ctx = await contextoDelEstudiante(cliente, id, req.usuario, { bloquear: true });
    const plan = calcularPlan(ctx);
    const { rows: [anterior] } = await cliente.query(
      "SELECT id, porcentaje_comision, version_condiciones FROM debitos_automaticos WHERE contrato_id = $1 AND estado = 'activo' FOR UPDATE", [ctx.contrato_id]);
    const eleg = elegibilidad(ctx, plan, { reemplazo: Boolean(anterior) });
    if (!eleg.ok) throw errorHttp(409, eleg.mensaje);

    if (anterior) {
      // Cambio de medio de pago: el débito nuevo hereda los cobros pendientes con su mismo porcentaje
      await cliente.query(
        "UPDATE debitos_automaticos SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Reemplazado por otro medio de pago.' WHERE id = $1",
        [anterior.id]);
      const { rows: [nuevo] } = await cliente.query(
        `INSERT INTO debitos_automaticos (contrato_id, pago_id, estudiante_id, propietario_id, metodo, fuente_wompi_id, fuente_descripcion,
           modo, porcentaje_comision, version_condiciones, aceptacion_wompi_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING id`,
        [ctx.contrato_id, id, ctx.estudiante_id, ctx.propietario_id, metodo, String(fuente.id), descripcion.slice(0, 60),
          cfg.modo, anterior.porcentaje_comision, anterior.version_condiciones]);
      const { rowCount: movidos } = await cliente.query(
        "UPDATE cobros_mensuales SET debito_id = $2 WHERE debito_id = $1 AND estado IN ('programado', 'fallido')", [anterior.id, nuevo.id]);
      await auditar({ actor: req.usuario, accion: 'debito_medio_cambiado', entidad: 'pago', entidadId: id,
        resumen: `Medio del débito automático cambiado a ${descripcion}; ${movidos} cobro(s) pendiente(s) pasan al medio nuevo.`,
        datos: { metodo, modo: cfg.modo }, ip: req.ip }, cliente);
      return { reemplazo: true, programados: movidos, ctx };
    }

    const { rows: [debito] } = await cliente.query(
      `INSERT INTO debitos_automaticos (contrato_id, pago_id, estudiante_id, propietario_id, metodo, fuente_wompi_id, fuente_descripcion,
         modo, porcentaje_comision, version_condiciones, aceptacion_wompi_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING id`,
      [ctx.contrato_id, id, ctx.estudiante_id, ctx.propietario_id, metodo, String(fuente.id), descripcion.slice(0, 60),
        cfg.modo, PORCENTAJE, ctx.version_condiciones]);
    let programados = 0;
    for (const m of plan) {
      const { rowCount } = await cliente.query(
        `INSERT INTO cobros_mensuales (debito_id, contrato_id, numero_mes, periodo_inicio, fecha_cobro, monto, porcentaje_comision, comision, neto_propietario, proximo_intento)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $5
         WHERE NOT EXISTS (SELECT 1 FROM cobros_mensuales WHERE contrato_id = $2 AND numero_mes = $3 AND estado <> 'cancelado')`,
        [debito.id, ctx.contrato_id, m.numeroMes, m.periodoInicio, m.fechaCobro, m.monto, PORCENTAJE, m.comision, m.neto]);
      programados += rowCount;
    }
    await auditar({ actor: req.usuario, accion: 'debito_activado', entidad: 'pago', entidadId: id,
      resumen: `Débito automático activado (${descripcion}); ${programados} cobro(s) programado(s).`,
      datos: { metodo, modo: cfg.modo, meses: plan.map((m) => m.numeroMes) }, ip: req.ip }, cliente);
    return { debitoId: debito.id, programados, ctx, primero: plan[0] };
  });

  if (r.reemplazo) {
    return res.json({ status: 'success', message: `Listo: desde ahora cobramos cada mes con ${descripcion}.`, data: { programados: r.programados } });
  }
  await crearAviso({ usuarioId: r.ctx.propietario_id, tipo: 'solicitud', titulo: 'Tu inquilino activó el débito automático',
    cuerpo: `${r.ctx.inmueble_titulo}: Roumix cobrará cada mes y te desembolsará el ${100 - PORCENTAJE} %.`, enlace: `pago.html?id=${id}` });
  res.json({
    status: 'success',
    message: `Débito automático activo con ${descripcion}. ${r.primero ? `El primer cobro será el ${r.primero.fechaCobro}.` : ''}`,
    data: { programados: r.programados }
  });
}

/** Cancela el débito activo de un contrato y sus cobros futuros. Devuelve cuántos cobros canceló. */
async function cancelarDebito(cliente, contratoId, motivo) {
  const { rows: [d] } = await cliente.query(
    "UPDATE debitos_automaticos SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = $2 WHERE contrato_id = $1 AND estado = 'activo' RETURNING id",
    [contratoId, motivo.slice(0, 300)]);
  if (!d) throw errorHttp(409, 'Este arriendo no tiene el débito automático activo.');
  // Los cobros que no han empezado se cancelan; uno en proceso con el banco se deja terminar
  const { rowCount } = await cliente.query(
    "UPDATE cobros_mensuales SET estado = 'cancelado', proximo_intento = NULL WHERE debito_id = $1 AND estado IN ('programado', 'fallido')", [d.id]);
  return rowCount;
}

/**
 * DELETE /api/pagos/:id/debito
 * El contrato obliga a pagar los meses siguientes por débito automático: el estudiante no lo
 * puede desactivar, solo cambiar el medio de pago. Si el contrato termina antes, lo cancela Roumix.
 */
async function desactivar(req, res) {
  const id = idEntero(req.params.id);
  await contextoDelEstudiante(db, id, req.usuario);
  throw errorHttp(409, 'El débito automático es obligatorio según tu contrato. Puedes cambiar el medio de pago; si el contrato termina antes, escríbele al equipo de Roumix desde Mensajes.');
}

// ============================================================================
// Cobros (tarea diaria) y resultado de Wompi
// ============================================================================

function nuevaReferencia(cobroId) {
  return `RMXM-${cobroId}-${hoyBogota().replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Registra un intento fallido: reintenta (máximo 3 en 3 días) o deja el cobro "vencido". */
async function registrarFallo(cliente, cobro, mensaje) {
  const intentos = cobro.intentos + 1;
  const vencido = intentos >= MAX_INTENTOS_COBRO;
  const proximo = vencido ? null : sumarDias(hoyBogota(), ESPERA_REINTENTO[intentos] || 1);
  await cliente.query(
    `UPDATE cobros_mensuales SET estado = $2, intentos = $3, proximo_intento = $4, ultimo_error = $5 WHERE id = $1`,
    [cobro.id, vencido ? 'vencido' : 'fallido', intentos, proximo, String(mensaje).slice(0, 300)]);
  return { vencido, proximo, intentos };
}

const SELECT_COBRO = `
  SELECT cm.*, d.estado AS debito_estado, d.fuente_wompi_id, d.metodo, d.estudiante_id, d.propietario_id, d.pago_id,
         s.inmueble_titulo, u.email AS estudiante_correo
  FROM cobros_mensuales cm
  JOIN debitos_automaticos d ON d.id = cm.debito_id
  JOIN pagos p ON p.id = d.pago_id
  JOIN solicitudes s ON s.id = p.solicitud_id
  LEFT JOIN usuarios u ON u.id = d.estudiante_id
  WHERE cm.id = $1`;

/**
 * Aplica el resultado de una transacción de un cobro mensual (referencia RMXM-…).
 * Idempotente: el mismo estado no se aplica dos veces y un estado final no vuelve atrás.
 */
async function aplicarCobro(tx, { req = null } = {}) {
  const estado = String(tx.status || '').toUpperCase();
  if (!['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(estado)) return { resultado: 'estado_desconocido' };
  const r = await enTransaccion(async (cliente) => {
    const { rows: [it] } = await cliente.query('SELECT * FROM cobros_intentos WHERE referencia = $1 FOR UPDATE', [String(tx.reference || '')]);
    if (!it) return { resultado: 'referencia_desconocida' };
    const { rows: [cobro] } = await cliente.query(`${SELECT_COBRO} FOR UPDATE OF cm`, [it.cobro_id]);
    if (Number(tx.amount_in_cents) !== Number(it.monto_centavos) || String(tx.currency) !== 'COP') {
      await cliente.query("UPDATE cobros_intentos SET estado = 'ERROR', wompi_transaccion_id = $2, mensaje = 'Monto distinto al firmado.' WHERE id = $1", [it.id, tx.id]);
      await auditar({ actorRol: 'sistema', accion: 'cobro_monto_no_coincide', entidad: 'cobro', entidadId: cobro.id,
        resumen: `Transacción ${tx.id} con monto distinto al firmado.`, datos: { referencia: it.referencia, estado } }, cliente);
      return { resultado: 'monto_no_coincide', cobro, aviso: estado === 'APPROVED' ? 'devolver' : null, tx };
    }
    const finales = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];
    if (it.estado === estado || (finales.includes(it.estado) && estado === 'PENDING')) return { resultado: 'sin_cambios' };
    const mensaje = wompi.mensajeHumano(estado, tx.status_message);
    await cliente.query('UPDATE cobros_intentos SET estado = $2, wompi_transaccion_id = $3, mensaje = $4 WHERE id = $1',
      [it.id, estado, tx.id || it.wompi_transaccion_id, String(tx.status_message || mensaje).slice(0, 300)]);

    if (estado === 'PENDING') return { resultado: 'en_proceso' };

    if (estado === 'APPROVED') {
      if (cobro.estado === 'aprobado' || cobro.estado === 'cancelado') {
        await auditar({ actorRol: 'sistema', accion: 'cobro_requiere_devolucion', entidad: 'cobro', entidadId: cobro.id,
          resumen: `Wompi aprobó ${tx.id} con el cobro en estado "${cobro.estado}": hay que devolverlo.`, datos: { referencia: it.referencia } }, cliente);
        return { resultado: 'requiere_devolucion', cobro, aviso: 'devolver', tx };
      }
      await cliente.query(
        `UPDATE cobros_mensuales SET estado = 'aprobado', referencia = $2, wompi_transaccion_id = $3, aprobado_en = now(),
           ultimo_error = NULL, proximo_intento = NULL, desembolso_estado = 'pendiente' WHERE id = $1`,
        [cobro.id, it.referencia, tx.id]);
      await auditar({ actorRol: 'sistema', accion: 'cobro_aprobado', entidad: 'cobro', entidadId: cobro.id,
        resumen: `Mes ${cobro.numero_mes} cobrado por débito automático (${it.referencia}).`,
        datos: { monto: cobro.monto, comision: cobro.comision, neto_propietario: cobro.neto_propietario } }, cliente);
      return { resultado: 'aprobado', cobro: { ...cobro, referencia: it.referencia }, aviso: 'aprobado' };
    }

    // DECLINED, VOIDED o ERROR
    if (!['en_proceso', 'programado', 'fallido'].includes(cobro.estado)) return { resultado: 'sin_cambios' };
    const f = await registrarFallo(cliente, cobro, mensaje);
    await auditar({ actorRol: 'sistema', accion: f.vencido ? 'cobro_vencido' : 'cobro_fallido', entidad: 'cobro', entidadId: cobro.id,
      resumen: `Mes ${cobro.numero_mes}: ${estado} (intento ${f.intentos} de ${MAX_INTENTOS_COBRO}).`, datos: { referencia: it.referencia } }, cliente);
    return { resultado: f.vencido ? 'vencido' : 'fallido', cobro, mensaje, fallo: f, aviso: f.vencido ? 'vencido' : 'fallido' };
  });

  await avisarCobro(r, req);
  return { resultado: r.resultado };
}

async function avisarCobro(r, req) {
  if (!r.aviso) return;
  const c = r.cobro;
  const pesos = (n) => `$${Number(n).toLocaleString('es-CO')}`;
  const enlace = `pago.html?id=${c.pago_id}`;
  if (r.aviso === 'aprobado') {
    await crearAviso({ usuarioId: c.estudiante_id, tipo: 'solicitud', titulo: `Cobramos el mes ${c.numero_mes} de tu arriendo`, cuerpo: `${pesos(c.monto)} · ${c.referencia}`, enlace });
    await crearAviso({ usuarioId: c.propietario_id, tipo: 'solicitud', titulo: `Recibimos el mes ${c.numero_mes} de tu arriendo`, cuerpo: `Tu desembolso: ${pesos(c.neto_propietario)}`, enlace });
  }
  if (r.aviso === 'fallido' || r.aviso === 'vencido') {
    await crearAviso({
      usuarioId: c.estudiante_id, tipo: 'solicitud',
      titulo: r.aviso === 'vencido' ? `No pudimos cobrar el mes ${c.numero_mes}` : `Falló el cobro del mes ${c.numero_mes}`,
      cuerpo: r.aviso === 'vencido'
        ? `${r.mensaje} Ya no lo reintentaremos: el equipo de Roumix te escribirá.`
        : `${r.mensaje} Lo reintentaremos el ${r.fallo.proximo}.`,
      enlace
    });
  }
  await notificaciones.notificarCobro({ cobro: c, evento: r.aviso, detalle: r.mensaje || (r.tx && `Transacción ${r.tx.id}`), proximo: r.fallo && r.fallo.proximo, urlBase: notificaciones.urlBase(req) });
}

/**
 * Tarea diaria: cobra los meses que vencen hoy (o antes) y reintenta los fallidos.
 * También revisa con Wompi los cobros que llevan más de 2 horas "en proceso" (por si un webhook no llegó).
 */
async function procesarCobros({ hoy = hoyBogota(), limite = 25, req = null } = {}) {
  const cfg = wompi.configDebito();
  if (!cfg.debito) return { procesados: 0, omitido: cfg.motivo };
  const resumen = { procesados: 0, aprobados: 0, fallidos: 0, en_proceso: 0, revisados: 0 };

  const { rows: vencen } = await db.query(
    `SELECT cm.id FROM cobros_mensuales cm JOIN debitos_automaticos d ON d.id = cm.debito_id
     WHERE d.estado = 'activo' AND cm.estado IN ('programado', 'fallido') AND COALESCE(cm.proximo_intento, cm.fecha_cobro) <= $1
     ORDER BY cm.fecha_cobro, cm.id LIMIT $2`, [hoy, limite]);

  for (const { id } of vencen) {
    // 1. Se reserva el cobro y se crea el intento (si dos tareas corren a la vez, solo una cobra)
    const intento = await enTransaccion(async (cliente) => {
      const { rows: [cobro] } = await cliente.query(`${SELECT_COBRO} FOR UPDATE OF cm`, [id]);
      if (!cobro || cobro.debito_estado !== 'activo' || !['programado', 'fallido'].includes(cobro.estado)) return null;
      const referencia = nuevaReferencia(cobro.id);
      await cliente.query('INSERT INTO cobros_intentos (cobro_id, referencia, monto_centavos) VALUES ($1, $2, $3)', [cobro.id, referencia, cobro.monto * 100]);
      await cliente.query("UPDATE cobros_mensuales SET estado = 'en_proceso' WHERE id = $1", [cobro.id]);
      return { cobro, referencia };
    });
    if (!intento) continue;
    resumen.procesados += 1;

    // 2. Se le pide el cobro a Wompi (fuera de la transacción)
    let tx;
    try {
      tx = await wompi.cobrarFuente({
        referencia: intento.referencia, montoCentavos: intento.cobro.monto * 100,
        correo: intento.cobro.estudiante_correo, fuenteId: intento.cobro.fuente_wompi_id, metodo: intento.cobro.metodo
      }, cfg);
    } catch (error) {
      // Wompi no aceptó la solicitud: cuenta como intento fallido
      tx = { id: null, reference: intento.referencia, status: 'ERROR', status_message: error.message, amount_in_cents: intento.cobro.monto * 100, currency: 'COP' };
    }
    const r = await aplicarCobro({ ...tx, reference: intento.referencia }, { req });
    if (r.resultado === 'aprobado') resumen.aprobados += 1;
    else if (r.resultado === 'fallido' || r.resultado === 'vencido') resumen.fallidos += 1;
    else resumen.en_proceso += 1;
  }

  // 3. Cobros "en proceso" hace más de 2 horas: se consulta a Wompi
  const { rows: colgados } = await db.query(
    `SELECT ci.wompi_transaccion_id FROM cobros_intentos ci JOIN cobros_mensuales cm ON cm.id = ci.cobro_id
     WHERE cm.estado = 'en_proceso' AND ci.estado IN ('creado', 'PENDING') AND ci.wompi_transaccion_id IS NOT NULL
       AND ci.updated_at < now() - interval '2 hours' LIMIT $1`, [limite]);
  for (const { wompi_transaccion_id: txId } of colgados) {
    try {
      await aplicarCobro(await wompi.consultarTransaccion(txId, cfg), { req });
      resumen.revisados += 1;
    } catch (error) {
      console.error('⚠️ No se pudo revisar un cobro en proceso:', error.message);
    }
  }

  // 4. Débitos sin meses pendientes quedan "finalizados"
  await db.query(
    `UPDATE debitos_automaticos d SET estado = 'finalizado'
     WHERE d.estado = 'activo' AND NOT EXISTS (
       SELECT 1 FROM cobros_mensuales cm WHERE cm.debito_id = d.id AND cm.estado IN ('programado', 'en_proceso', 'fallido'))
       AND EXISTS (SELECT 1 FROM cobros_mensuales cm WHERE cm.debito_id = d.id)`);
  return resumen;
}

// ============================================================================
// Administración
// ============================================================================

/** GET /api/admin/cobros?estado= */
async function listarAdmin(req, res) {
  const estado = String(req.query.estado || 'todos');
  const filtros = {
    todos: "cm.estado <> 'cancelado'",
    por_desembolsar: "cm.estado = 'aprobado' AND cm.desembolso_estado = 'pendiente'",
    problemas: "cm.estado IN ('fallido', 'vencido')",
    programados: "cm.estado IN ('programado', 'en_proceso')"
  };
  if (!filtros[estado]) throw errorHttp(400, 'Filtro no válido.');
  const { rows } = await db.query(
    `SELECT cm.id, cm.numero_mes, to_char(cm.fecha_cobro, 'YYYY-MM-DD') AS fecha_cobro, to_char(cm.proximo_intento, 'YYYY-MM-DD') AS proximo_intento,
            cm.monto, cm.porcentaje_comision, cm.comision, cm.neto_propietario, cm.estado, cm.intentos, cm.referencia, cm.ultimo_error, cm.aprobado_en,
            cm.desembolso_estado, cm.desembolso_referencia, d.pago_id, d.fuente_descripcion, d.modo,
            s.inmueble_titulo, e.nombre AS estudiante_nombre, pr.nombre AS propietario_nombre
     FROM cobros_mensuales cm JOIN debitos_automaticos d ON d.id = cm.debito_id
     JOIN pagos p ON p.id = d.pago_id JOIN solicitudes s ON s.id = p.solicitud_id
     LEFT JOIN usuarios e ON e.id = d.estudiante_id LEFT JOIN usuarios pr ON pr.id = d.propietario_id
     WHERE ${filtros[estado]} ORDER BY cm.fecha_cobro, cm.id LIMIT 200`);
  // Arriendos con el primer mes pagado que todavía no activan el débito obligatorio
  const { rows: sinDebito } = await db.query(
    `SELECT p.id AS pago_id, s.inmueble_titulo, e.nombre AS estudiante_nombre, p.aprobado_en
     FROM pagos p JOIN contratos c ON c.id = p.contrato_id JOIN solicitudes s ON s.id = p.solicitud_id
     LEFT JOIN usuarios e ON e.id = p.estudiante_id
     WHERE p.estado = 'aprobado' AND c.estado = 'formalizado' AND c.duracion_meses >= 2
       AND (c.fecha_inicio + make_interval(months => c.duracion_meses)) > CURRENT_DATE
       AND NOT EXISTS (SELECT 1 FROM debitos_automaticos d WHERE d.contrato_id = c.id AND d.estado IN ('activo', 'finalizado'))
     ORDER BY p.aprobado_en LIMIT 100`);
  const cfg = wompi.configDebito();
  res.json({ status: 'success', habilitado: cfg.debito, motivo: cfg.debito ? null : cfg.motivo, data: rows, sinDebito });
}

/**
 * POST /api/admin/pagos/:id/debito/cancelar  { motivo }
 * El débito es obligatorio para el estudiante: solo el equipo lo cancela (por ejemplo, si el
 * contrato termina antes). Los cobros futuros se cancelan; uno en proceso se deja terminar.
 */
async function cancelarAdmin(req, res) {
  const id = idEntero(req.params.id);
  const motivo = String((req.body || {}).motivo || '').trim();
  if (motivo.length < 10 || motivo.length > 300) throw errorHttp(400, 'Explica el motivo de la cancelación (entre 10 y 300 caracteres).');
  const r = await enTransaccion(async (cliente) => {
    const { rows: [ctx] } = await cliente.query(`${SELECT_CONTEXTO} FOR UPDATE OF p`, [id]);
    if (!ctx) throw errorHttp(404, 'No existe ese pago.');
    const cancelados = await cancelarDebito(cliente, ctx.contrato_id, `Cancelado por Roumix: ${motivo}`);
    await auditar({ actor: req.usuario, accion: 'debito_cancelado', entidad: 'pago', entidadId: id,
      resumen: `Débito automático cancelado por el equipo; ${cancelados} cobro(s) futuro(s) cancelado(s).`, datos: { motivo }, ip: req.ip }, cliente);
    return { ctx, cancelados };
  });
  for (const usuarioId of [r.ctx.estudiante_id, r.ctx.propietario_id]) {
    await crearAviso({ usuarioId, tipo: 'solicitud', titulo: 'Roumix canceló el débito automático',
      cuerpo: `${r.ctx.inmueble_titulo}: ${motivo}`, enlace: `pago.html?id=${id}` });
  }
  res.json({ status: 'success', message: `Débito cancelado; ${r.cancelados} cobro(s) futuro(s) cancelado(s).` });
}

/** POST /api/admin/cobros/procesar — ejecuta ahora los cobros pendientes (lo mismo que la tarea diaria) */
async function procesarAdmin(req, res) {
  const cfg = wompi.configDebito();
  if (!cfg.debito) throw errorHttp(503, cfg.motivo === 'falta_llave_privada'
    ? 'Falta la llave privada de Wompi (WOMPI_PRIVATE_KEY) en el servidor.' : 'Wompi no está activo.');
  const r = await procesarCobros({ req });
  res.json({ status: 'success', message: `Cobros procesados: ${r.procesados} (aprobados ${r.aprobados}, fallidos ${r.fallidos}, en proceso ${r.en_proceso}).`, data: r });
}

/** POST /api/admin/cobros/:id/desembolso — registra la transferencia del neto al propietario */
async function desembolsoAdmin(req, res) {
  const id = idEntero(req.params.id);
  const c = await enTransaccion(async (cliente) => {
    const { rows: [cobro] } = await cliente.query(`${SELECT_COBRO} FOR UPDATE OF cm`, [id]);
    if (!cobro) throw errorHttp(404, `No existe el cobro ${id}.`);
    if (cobro.estado !== 'aprobado' || cobro.desembolso_estado !== 'pendiente') throw errorHttp(409, 'Solo se desembolsa un cobro aprobado con el desembolso pendiente.');
    const ref = pagos.referencia('DSB');
    await cliente.query("UPDATE cobros_mensuales SET desembolso_estado = 'realizado', desembolso_referencia = $2, desembolso_en = now() WHERE id = $1", [id, ref]);
    return { ...cobro, desembolso_referencia: ref };
  });
  await crearAviso({ usuarioId: c.propietario_id, tipo: 'solicitud', titulo: `Desembolso del mes ${c.numero_mes} registrado`,
    cuerpo: `$${Number(c.neto_propietario).toLocaleString('es-CO')} · ${c.desembolso_referencia}`, enlace: `pago.html?id=${c.pago_id}` });
  res.json({ status: 'success', message: `Desembolso del mes ${c.numero_mes} registrado (${c.desembolso_referencia}).` });
}

module.exports = {
  preparar, activar, desactivar, cancelarAdmin, resumenParaPago,
  procesarCobros, aplicarCobro, calcularPlan, listarAdmin, procesarAdmin, desembolsoAdmin,
  hoyBogota, MAX_INTENTOS_COBRO
};
