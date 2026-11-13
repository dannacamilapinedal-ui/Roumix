/**
 * Contratos de arrendamiento — flujo DEMOSTRATIVO.
 *
 * El contrato es entre el estudiante (arrendatario) y el propietario (arrendador);
 * Roumix solo prepara el documento y registra la aceptación de cada parte.
 * La aceptación (nombre escrito + fecha y hora) NO es una firma electrónica con
 * validez legal: para eso hay que integrar un proveedor certificado más adelante.
 *
 * Al aceptarlo ambas partes, el contrato queda "formalizado" y la solicitud pasa
 * sola a "contrato_formalizado" (estado que ningún usuario puede poner a mano).
 */
const crypto = require('crypto');
const db = require('../config/db');
const notificaciones = require('../services/notificacionesService');
const { crearAviso } = require('../services/avisosService');
const pagos = require('../services/pagosService');
const { auditar } = require('../services/auditoriaService');
const { avisarPagoHabilitado } = require('./pagosController');

const PLAZO_ACEPTACION_DIAS = 7;
const VIGENTES = ['borrador', 'enviado', 'pendiente_aceptacion'];
const ETIQUETAS = {
  borrador: 'Borrador', enviado: 'Enviado', pendiente_aceptacion: 'Pendiente de aceptación',
  formalizado: 'Formalizado', cancelado: 'Cancelado', expirado: 'Expirado'
};

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

function entero(valor, campo, min, max, opcional = false) {
  if (opcional && (valor === undefined || valor === null || valor === '')) return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw errorHttp(400, `${campo} debe ser un número entero entre ${min.toLocaleString('es-CO')} y ${max.toLocaleString('es-CO')}.`);
  return n;
}

function textoOpcional(valor, campo, max) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw errorHttp(400, `${campo} debe ser texto.`);
  const limpio = valor.trim();
  if (limpio.length > max) throw errorHttp(400, `${campo} admite máximo ${max} caracteres.`);
  return limpio || null;
}

function fecha(valor, campo) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
      Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) ||
      new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) !== valor) {
    throw errorHttp(400, `${campo} no es una fecha válida.`);
  }
  return valor;
}

/** Valida las condiciones que Roumix escribe en el borrador. */
function validarCondiciones(body) {
  return {
    canon: entero(body.canonMensual, 'El canon mensual', 1, 100000000),
    deposito: entero(body.deposito, 'El depósito', 0, 100000000, true),
    fechaInicio: fecha(body.fechaInicio, 'La fecha de inicio'),
    duracion: entero(body.duracionMeses, 'La duración', 1, 24),
    diaPago: entero(body.diaPago === undefined ? 5 : body.diaPago, 'El día de pago', 1, 28),
    direccion: textoOpcional(body.inmuebleDireccion, 'La dirección', 200),
    servicios: textoOpcional(body.serviciosIncluidos, 'Los servicios incluidos', 500),
    condiciones: textoOpcional(body.condiciones, 'Las condiciones', 5000)
  };
}

// pg entrega las columnas DATE como Date a medianoche local: se lleva a AAAA-MM-DD
function fechaISO(valor) {
  if (valor instanceof Date) {
    const dos = (n) => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${dos(valor.getMonth() + 1)}-${dos(valor.getDate())}`;
  }
  return String(valor).slice(0, 10);
}

// Contenido que se "sella" al enviar: si cambiara, la huella no coincidiría
function calcularHuella(c) {
  const contenido = [
    c.id, c.solicitud_id, c.estudiante_nombre, c.propietario_nombre, c.inmueble_titulo, c.inmueble_direccion || '',
    c.canon_mensual, c.deposito ?? '', fechaISO(c.fecha_inicio), c.duracion_meses, c.dia_pago,
    c.servicios_incluidos || '', c.condiciones || ''
  ].join('|');
  return crypto.createHash('sha256').update(contenido).digest('hex');
}

// Los contratos enviados que nadie terminó de aceptar a tiempo pasan a "expirado"
async function expirarVencidos() {
  await db.query(
    `UPDATE contratos SET estado = 'expirado'
     WHERE estado IN ('enviado', 'pendiente_aceptacion') AND vence_en < now()`
  );
}

const SELECT_CONTRATO = `
  SELECT c.*, s.estado AS solicitud_estado, i.barrio,
         (c.fecha_inicio + make_interval(months => c.duracion_meses) - interval '1 day')::date AS fecha_fin
  FROM contratos c
  JOIN solicitudes s ON s.id = c.solicitud_id
  JOIN inmuebles i ON i.id = c.inmueble_id`;

// Lo que ve cada parte: el documento completo (sin correos ni teléfonos de nadie)
function vistaParte(c, rol) {
  const { creado_por: _c, estudiante_id: _e, propietario_id: _p, ...resto } = c;
  return {
    ...resto,
    mi_rol: rol,
    acepte: rol === 'estudiante' ? Boolean(c.aceptado_estudiante_en) : Boolean(c.aceptado_propietario_en),
    puedo_aceptar: ['enviado', 'pendiente_aceptacion'].includes(c.estado) &&
      !(rol === 'estudiante' ? c.aceptado_estudiante_en : c.aceptado_propietario_en),
    huella_valida: c.huella ? c.huella === calcularHuella(c) : null
  };
}

// ============================================================================
// Partes del contrato (estudiante, propietario) y consulta del admin
// ============================================================================

/** GET /api/contratos/mios */
async function misContratos(req, res) {
  await expirarVencidos();
  const columna = req.usuario.rol === 'estudiante' ? 'estudiante_id' : 'propietario_id';
  const { rows } = await db.query(
    `${SELECT_CONTRATO} WHERE c.${columna} = $1 AND c.estado <> 'borrador' ORDER BY c.updated_at DESC`,
    [req.usuario.id]
  );
  res.json({ status: 'success', data: rows.map((c) => vistaParte(c, req.usuario.rol)) });
}

/** GET /api/contratos/:id — partes (si ya fue enviado) y administración */
async function verContrato(req, res) {
  await expirarVencidos();
  const id = idEntero(req.params.id);
  const { rows } = await db.query(`${SELECT_CONTRATO} WHERE c.id = $1`, [id]);
  const c = rows[0];
  if (req.usuario.rol === 'admin') {
    if (!c) throw errorHttp(404, `No existe el contrato ${id}.`);
    return res.json({ status: 'success', data: { ...vistaParte(c, 'admin'), puedo_aceptar: false, acepte: false } });
  }
  const esParte = c && (req.usuario.rol === 'estudiante' ? c.estudiante_id : c.propietario_id) === req.usuario.id;
  if (!esParte || c.estado === 'borrador') throw errorHttp(404, 'No tienes un contrato con ese número.');
  res.json({ status: 'success', data: vistaParte(c, req.usuario.rol) });
}

/** POST /api/contratos/:id/aceptar  { firma, confirmo: true } */
async function aceptarContrato(req, res) {
  await expirarVencidos();
  const id = idEntero(req.params.id);
  const body = req.body || {};
  const firma = textoOpcional(body.firma, 'Tu nombre', 120);
  if (!firma || firma.length < 5) throw errorHttp(400, 'Escribe tu nombre completo para aceptar.');
  if (body.confirmo !== true) throw errorHttp(400, 'Debes confirmar que leíste las condiciones.');
  const esEstudiante = req.usuario.rol === 'estudiante';

  const cliente = await db.pool.connect();
  let c;
  let formalizado = false;
  let pagoHabilitado = null;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM contratos WHERE id = $1 FOR UPDATE', [id]);
    c = rows[0];
    const esParte = c && (esEstudiante ? c.estudiante_id : c.propietario_id) === req.usuario.id;
    if (!esParte || c.estado === 'borrador') throw errorHttp(404, 'No tienes un contrato con ese número.');
    if (!['enviado', 'pendiente_aceptacion'].includes(c.estado)) {
      throw errorHttp(409, `Este contrato está "${ETIQUETAS[c.estado]}" y ya no se puede aceptar.`);
    }
    if (esEstudiante ? c.aceptado_estudiante_en : c.aceptado_propietario_en) throw errorHttp(409, 'Ya aceptaste este contrato.');
    // El contenido debe ser exactamente el que se envió
    if (c.huella !== calcularHuella(c)) throw errorHttp(409, 'El contrato cambió después de enviarse. Escríbele al equipo de Roumix.');

    const otraParteAcepto = esEstudiante ? c.aceptado_propietario_en : c.aceptado_estudiante_en;
    formalizado = Boolean(otraParteAcepto);
    await cliente.query(
      `UPDATE contratos SET
         ${esEstudiante ? 'aceptado_estudiante_en = now(), firma_estudiante = $2' : 'aceptado_propietario_en = now(), firma_propietario = $2'},
         estado = $3::varchar, formalizado_en = CASE WHEN $3::varchar = 'formalizado' THEN now() ELSE NULL END
       WHERE id = $1`,
      [id, firma, formalizado ? 'formalizado' : 'pendiente_aceptacion']
    );

    const nota = `${esEstudiante ? 'El estudiante' : 'El propietario'} aceptó el contrato #${id} (aceptación demostrativa).`;
    await auditar({
      actor: req.usuario, accion: formalizado ? 'contrato_formalizado' : 'contrato_aceptado', entidad: 'contrato', entidadId: id,
      resumen: formalizado ? `${nota} Con esta aceptación quedó formalizado.` : nota,
      datos: { solicitud_id: c.solicitud_id, huella: c.huella }, ip: req.ip
    }, cliente);
    if (formalizado) {
      // Paso automático de la solicitud: solo el sistema pone "contrato_formalizado"
      const { rows: [s] } = await cliente.query('SELECT estado FROM solicitudes WHERE id = $1 FOR UPDATE', [c.solicitud_id]);
      await cliente.query("UPDATE solicitudes SET estado = 'contrato_formalizado' WHERE id = $1", [c.solicitud_id]);
      await cliente.query(
        `INSERT INTO solicitudes_historial (solicitud_id, estado_anterior, estado_nuevo, autor_id, autor_rol, nota_estudiante, nota_propietario, nota_interna)
         VALUES ($1, $2, 'contrato_formalizado', NULL, 'sistema', $3, $3, $4)`,
        [c.solicitud_id, s.estado, `Ambas partes aceptaron el contrato #${id}. El siguiente paso es el pago del primer mes a través de Roumix.`, nota]
      );
      // Se habilita el pago del primer canon (si el propietario aceptó las condiciones de la comisión)
      pagoHabilitado = await pagos.habilitarPago(cliente, c.solicitud_id);
    } else {
      await cliente.query(
        `INSERT INTO solicitudes_historial (solicitud_id, autor_id, autor_rol, nota_interna) VALUES ($1, $2, $3, $4)`,
        [c.solicitud_id, req.usuario.id, req.usuario.rol, nota]
      );
    }
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  const urlBase = notificaciones.urlBase(req);
  const enlace = `contrato.html?id=${id}`;
  if (formalizado) {
    for (const usuarioId of [c.estudiante_id, c.propietario_id]) {
      await crearAviso({ usuarioId, tipo: 'solicitud', titulo: `Contrato #${id} formalizado`, cuerpo: c.inmueble_titulo, enlace });
    }
    await notificaciones.notificarContrato({ contrato: c, evento: 'formalizado', urlBase });
    if (pagoHabilitado && pagoHabilitado.habilitado) {
      await avisarPagoHabilitado(pagoHabilitado, urlBase);
    } else if (pagoHabilitado && pagoHabilitado.motivo === 'comision_no_aceptada') {
      await crearAviso({
        usuarioId: c.propietario_id, tipo: 'verificacion', titulo: 'Acepta las condiciones de la comisión',
        cuerpo: 'Es necesario para habilitar el pago del primer mes del estudiante.', enlace: 'verificacion.html'
      });
    }
  } else {
    const otra = esEstudiante ? c.propietario_id : c.estudiante_id;
    await crearAviso({
      usuarioId: otra, tipo: 'solicitud', titulo: `Falta tu aceptación del contrato #${id}`,
      cuerpo: `${esEstudiante ? 'El estudiante' : 'El propietario'} ya lo aceptó.`, enlace
    });
    await notificaciones.notificarContrato({ contrato: c, evento: 'aceptado_parcial', parte: req.usuario.rol, urlBase });
  }

  res.json({
    status: 'success',
    message: formalizado
      ? '¡Contrato formalizado! Ambas partes lo aceptaron.'
      : 'Aceptaste el contrato. Falta la aceptación de la otra parte.',
    data: { id, estado: formalizado ? 'formalizado' : 'pendiente_aceptacion' }
  });
}

// ============================================================================
// Administración
// ============================================================================

/** GET /api/admin/contratos?estado=vigentes|<estado>|todos */
async function listarAdmin(req, res) {
  await expirarVencidos();
  const estado = String(req.query.estado || 'vigentes');
  const params = [];
  let condicion = 'TRUE';
  if (estado === 'vigentes') condicion = `c.estado IN ('borrador', 'enviado', 'pendiente_aceptacion')`;
  else if (ETIQUETAS[estado]) { params.push(estado); condicion = 'c.estado = $1'; }
  else if (estado !== 'todos') throw errorHttp(400, 'Filtro de estado no válido.');
  const { rows } = await db.query(`${SELECT_CONTRATO} WHERE ${condicion} ORDER BY c.updated_at DESC LIMIT 200`, params);
  res.json({ status: 'success', data: rows });
}

/** GET /api/admin/solicitudes/:id/contratos — historial de contratos de una solicitud */
async function contratosDeSolicitud(req, res) {
  await expirarVencidos();
  const id = idEntero(req.params.id);
  const { rows } = await db.query(`${SELECT_CONTRATO} WHERE c.solicitud_id = $1 ORDER BY c.created_at DESC`, [id]);
  res.json({ status: 'success', data: rows });
}

/**
 * POST /api/admin/solicitudes/:id/contrato — crea el borrador con los datos de la solicitud.
 * Solo cuando la solicitud está en "Contrato pendiente".
 */
async function crearBorrador(req, res) {
  const solicitudId = idEntero(req.params.id);
  const d = validarCondiciones(req.body || {});

  const { rows } = await db.query(
    `SELECT s.id, s.estado, s.inmueble_id, s.estudiante_id, s.propietario_id, s.inmueble_titulo,
            e.nombre AS estudiante_nombre, COALESCE(v.nombre_completo, p.nombre) AS propietario_nombre
     FROM solicitudes s
     LEFT JOIN usuarios e ON e.id = s.estudiante_id
     LEFT JOIN usuarios p ON p.id = s.propietario_id
     LEFT JOIN verificaciones_propietario v ON v.propietario_id = s.propietario_id
     WHERE s.id = $1`,
    [solicitudId]
  );
  if (rows.length === 0) throw errorHttp(404, `No existe la solicitud ${solicitudId}.`);
  const s = rows[0];
  if (s.estado !== 'contrato_pendiente') {
    throw errorHttp(409, 'El contrato se prepara cuando la solicitud está en "Contrato pendiente".');
  }
  if (!s.estudiante_id || !s.propietario_id) throw errorHttp(409, 'Una de las cuentas de la solicitud ya no existe.');

  try {
    const { rows: [nuevo] } = await db.query(
      `INSERT INTO contratos (solicitud_id, inmueble_id, estudiante_id, propietario_id, estudiante_nombre, propietario_nombre,
         inmueble_titulo, inmueble_direccion, canon_mensual, deposito, fecha_inicio, duracion_meses, dia_pago,
         servicios_incluidos, condiciones, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [s.id, s.inmueble_id, s.estudiante_id, s.propietario_id, s.estudiante_nombre, s.propietario_nombre,
       s.inmueble_titulo, d.direccion, d.canon, d.deposito, d.fechaInicio, d.duracion, d.diaPago,
       d.servicios, d.condiciones, req.usuario.id]
    );
    await db.query(
      `INSERT INTO solicitudes_historial (solicitud_id, autor_id, autor_rol, nota_interna) VALUES ($1, $2, 'admin', $3)`,
      [s.id, req.usuario.id, `Borrador del contrato #${nuevo.id} creado.`]
    );
    res.status(201).json({ status: 'success', message: `Borrador del contrato #${nuevo.id} creado.`, data: { id: nuevo.id } });
  } catch (error) {
    if (error.code === '23505') throw errorHttp(409, 'Esta solicitud ya tiene un contrato vigente.');
    throw error;
  }
}

/** PUT /api/admin/contratos/:id — editar un borrador */
async function editarBorrador(req, res) {
  const id = idEntero(req.params.id);
  const d = validarCondiciones(req.body || {});
  const { rowCount } = await db.query(
    `UPDATE contratos SET inmueble_direccion = $2, canon_mensual = $3, deposito = $4, fecha_inicio = $5,
       duracion_meses = $6, dia_pago = $7, servicios_incluidos = $8, condiciones = $9
     WHERE id = $1 AND estado = 'borrador'`,
    [id, d.direccion, d.canon, d.deposito, d.fechaInicio, d.duracion, d.diaPago, d.servicios, d.condiciones]
  );
  if (rowCount === 0) throw errorHttp(409, 'Solo se puede editar un contrato en borrador. Si ya se envió, cancélalo y crea uno nuevo.');
  res.json({ status: 'success', message: 'Borrador guardado.' });
}

/** POST /api/admin/contratos/:id/enviar — lo sella y lo envía a ambas partes */
async function enviarContrato(req, res) {
  const id = idEntero(req.params.id);
  const cliente = await db.pool.connect();
  let c;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT c.*, s.estado AS solicitud_estado FROM contratos c JOIN solicitudes s ON s.id = c.solicitud_id
       WHERE c.id = $1 FOR UPDATE OF c`,
      [id]
    );
    c = rows[0];
    if (!c) throw errorHttp(404, `No existe el contrato ${id}.`);
    if (c.estado !== 'borrador') throw errorHttp(409, 'Este contrato ya fue enviado.');
    if (c.solicitud_estado !== 'contrato_pendiente') throw errorHttp(409, 'La solicitud ya no está en "Contrato pendiente".');
    if (fechaISO(c.fecha_inicio) < new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)) {
      throw errorHttp(409, 'La fecha de inicio ya pasó. Corrígela antes de enviar.');
    }
    const huella = calcularHuella(c);
    await cliente.query(
      `UPDATE contratos SET estado = 'enviado', enviado_en = now(), vence_en = now() + make_interval(days => $2), huella = $3 WHERE id = $1`,
      [id, PLAZO_ACEPTACION_DIAS, huella]
    );
    await cliente.query(
      `INSERT INTO solicitudes_historial (solicitud_id, autor_id, autor_rol, nota_estudiante, nota_propietario, nota_interna)
       VALUES ($1, $2, 'admin', $3, $3, $4)`,
      [c.solicitud_id, req.usuario.id,
       `Roumix te envió el contrato #${id} para que lo revises y lo aceptes. Tienes ${PLAZO_ACEPTACION_DIAS} días.`,
       `Contrato #${id} enviado a ambas partes.`]
    );
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  const enlace = `contrato.html?id=${id}`;
  for (const usuarioId of [c.estudiante_id, c.propietario_id]) {
    await crearAviso({ usuarioId, tipo: 'solicitud', titulo: `Contrato #${id} listo para revisar`, cuerpo: c.inmueble_titulo, enlace });
  }
  await notificaciones.notificarContrato({ contrato: c, evento: 'enviado', urlBase: notificaciones.urlBase(req) });
  res.json({ status: 'success', message: `Contrato #${id} enviado a ambas partes. Tienen ${PLAZO_ACEPTACION_DIAS} días para aceptarlo.` });
}

/** POST /api/admin/contratos/:id/cancelar  { motivo } */
async function cancelarContrato(req, res) {
  const id = idEntero(req.params.id);
  const motivo = textoOpcional((req.body || {}).motivo, 'El motivo', 500);
  if (!motivo || motivo.length < 5) throw errorHttp(400, 'Escribe el motivo de la cancelación.');
  const { rows } = await db.query(
    `UPDATE contratos SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = $2
     WHERE id = $1 AND estado IN ('borrador', 'enviado', 'pendiente_aceptacion')
     RETURNING id, estado, solicitud_id, estudiante_id, propietario_id, enviado_en, inmueble_titulo`,
    [id, motivo]
  );
  if (rows.length === 0) throw errorHttp(409, 'Solo se puede cancelar un contrato que aún no se ha formalizado.');
  const c = rows[0];
  await db.query(
    `INSERT INTO solicitudes_historial (solicitud_id, autor_id, autor_rol, nota_estudiante, nota_propietario, nota_interna)
     VALUES ($1, $2, 'admin', $3, $3, $4)`,
    [c.solicitud_id, req.usuario.id,
     c.enviado_en ? `El contrato #${id} fue cancelado. Roumix te contará los siguientes pasos.` : null,
     `Contrato #${id} cancelado: ${motivo}`]
  );
  if (c.enviado_en) {
    for (const usuarioId of [c.estudiante_id, c.propietario_id]) {
      await crearAviso({ usuarioId, tipo: 'solicitud', titulo: `Contrato #${id} cancelado`, cuerpo: c.inmueble_titulo, enlace: 'solicitudes.html' });
    }
  }
  res.json({ status: 'success', message: `Contrato #${id} cancelado.` });
}

/**
 * Cancela el contrato vigente de una solicitud que deja el camino del contrato
 * (vuelve a negociación, se cancela o se rechaza). Se usa dentro de la transacción
 * del cambio de estado de la solicitud.
 */
async function cancelarVigenteDeSolicitud(cliente, solicitudId, motivo) {
  await cliente.query(
    `UPDATE contratos SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = $2
     WHERE solicitud_id = $1 AND estado IN ('borrador', 'enviado', 'pendiente_aceptacion')`,
    [solicitudId, motivo]
  );
}

module.exports = {
  ETIQUETAS,
  VIGENTES,
  misContratos,
  verContrato,
  aceptarContrato,
  listarAdmin,
  contratosDeSolicitud,
  crearBorrador,
  editarBorrador,
  enviarContrato,
  cancelarContrato,
  cancelarVigenteDeSolicitud,
  calcularHuella
};
