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
const contratoPdf = require('../services/contratoPdfService');
const codigoFirma = require('../services/codigoFirmaService');
const firmaService = require('../services/firmaService');

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
    // Ley 820 de 2003, art. 16: en vivienda urbana no se pueden exigir depósitos en dinero.
    // Los contratos nuevos no registran depósito (se ignora si llega).
    deposito: null,
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
    huella_valida: c.huella ? c.huella === calcularHuella(c) : null,
    // PDF sellado (F-1): huella del documento y estado de la plantilla legal
    pdf: c.pdf_sha256 ? {
      sha256: c.pdf_sha256,
      plantilla: c.plantilla_version,
      plantillaRevisada: c.plantilla_version === contratoPdf.PLANTILLA.version && contratoPdf.PLANTILLA.revisada
    } : null
  };
}

// ============================================================================
// Partes del contrato (estudiante, propietario) y consulta del admin
// ============================================================================

/** Firmas de un contrato: imagen, nombre, documento y fecha; con evidencias técnicas para el equipo. */
async function firmasDe(contratoId, conEvidencias) {
  const { rows } = await db.query(
    `SELECT rol, nombre_escrito, documento, firma_png, firma_sha256, firmado_en, codigo_enviado_a, pdf_sha256, ip, dispositivo
     FROM firmas_contrato WHERE contrato_id = $1 ORDER BY firmado_en`, [contratoId]);
  return rows.map((f) => ({
    rol: f.rol,
    nombre: f.nombre_escrito,
    documento: f.documento,
    firmadoEn: f.firmado_en,
    imagen: `data:image/png;base64,${f.firma_png.toString('base64')}`,
    firmaSha256: f.firma_sha256,
    codigoEnviadoA: codigoFirma.ocultarCorreo(f.codigo_enviado_a),
    ...(conEvidencias ? { pdfSha256: f.pdf_sha256, ip: f.ip, dispositivo: f.dispositivo, correo: f.codigo_enviado_a } : {})
  }));
}

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
    return res.json({ status: 'success', data: { ...vistaParte(c, 'admin'), puedo_aceptar: false, acepte: false, firmas: await firmasDe(id, true) }, consentimiento: firmaService.CONSENTIMIENTO });
  }
  const esParte = c && (req.usuario.rol === 'estudiante' ? c.estudiante_id : c.propietario_id) === req.usuario.id;
  if (!esParte || c.estado === 'borrador') throw errorHttp(404, 'No tienes un contrato con ese número.');
  res.json({ status: 'success', data: { ...vistaParte(c, req.usuario.rol), firmas: await firmasDe(id, false) }, consentimiento: firmaService.CONSENTIMIENTO });
}

/**
 * Revisa que el usuario sea parte del contrato y que aún pueda firmarlo (sin bloquear).
 * Devuelve el contrato.
 */
async function contratoFirmable(id, usuario) {
  const esEstudiante = usuario.rol === 'estudiante';
  const { rows: [c] } = await db.query(
    `SELECT id, estado, estudiante_id, propietario_id, aceptado_estudiante_en, aceptado_propietario_en, inmueble_titulo,
            estudiante_nombre, propietario_nombre FROM contratos WHERE id = $1`, [id]);
  const esParte = c && (esEstudiante ? c.estudiante_id : c.propietario_id) === usuario.id;
  if (!esParte || c.estado === 'borrador') throw errorHttp(404, 'No tienes un contrato con ese número.');
  if (!['enviado', 'pendiente_aceptacion'].includes(c.estado)) throw errorHttp(409, `Este contrato está "${ETIQUETAS[c.estado]}" y ya no se puede firmar.`);
  if (esEstudiante ? c.aceptado_estudiante_en : c.aceptado_propietario_en) throw errorHttp(409, 'Ya firmaste este contrato.');
  return c;
}

/**
 * POST /api/contratos/:id/codigo — envía al correo confirmado del usuario el código para firmar (F-2).
 * El código nunca se devuelve en la respuesta: solo llega al correo.
 */
async function solicitarCodigo(req, res) {
  await expirarVencidos();
  const id = idEntero(req.params.id);
  const c = await contratoFirmable(id, req.usuario);
  const { rows: [cuenta] } = await db.query('SELECT email, email_confirmed_at FROM auth.users WHERE id = $1', [req.usuario.id]);
  if (!cuenta || !cuenta.email_confirmed_at) throw errorHttp(403, 'Confirma tu correo antes de firmar: el código para firmar se envía a ese correo.');
  await codigoFirma.revisarLimites(id, req.usuario.id);
  const nuevo = await codigoFirma.crearCodigo(id, req.usuario.id, { correo: cuenta.email, ip: req.ip });
  const enviado = await notificaciones.enviarCodigoFirma({
    para: cuenta.email, nombre: req.usuario.nombre, codigo: nuevo.codigo, contratoId: id,
    inmueble: c.inmueble_titulo, minutos: codigoFirma.MINUTOS_VIGENCIA
  });
  if (!enviado) {
    await db.query('UPDATE firmas_codigos SET anulado_en = now() WHERE id = $1', [nuevo.id]);
    throw errorHttp(502, 'No pudimos enviar el correo con el código. Intenta de nuevo en un momento.');
  }
  res.json({
    status: 'success',
    message: `Te enviamos un código de 6 dígitos a ${codigoFirma.ocultarCorreo(cuenta.email)}.`,
    data: { enviadoA: codigoFirma.ocultarCorreo(cuenta.email), minutos: codigoFirma.MINUTOS_VIGENCIA, reenviarEn: codigoFirma.SEGUNDOS_ENTRE_ENVIOS }
  });
}

/** Solo para las pruebas automáticas: crea un código sin enviar correo y lo devuelve. */
async function crearCodigoFirma(contratoId, usuarioId) {
  return (await codigoFirma.crearCodigo(contratoId, usuarioId, { correo: '(prueba automática)' })).codigo;
}

/** POST /api/contratos/:id/aceptar  { firma, confirmo: true, codigo, firmaImagen } */
async function aceptarContrato(req, res) {
  await expirarVencidos();
  const id = idEntero(req.params.id);
  const body = req.body || {};
  const firma = textoOpcional(body.firma, 'Tu nombre', 120);
  if (!firma || firma.length < 5) throw errorHttp(400, 'Escribe tu nombre completo para aceptar.');
  if (body.confirmo !== true) throw errorHttp(400, 'Debes confirmar que leíste las condiciones.');
  const esEstudiante = req.usuario.rol === 'estudiante';
  // F-3: la firma manuscrita dibujada se valida antes de gastar el código
  const imagenFirma = firmaService.validarImagen(body.firmaImagen);
  const previo = await contratoFirmable(id, req.usuario);
  const nombreDocumento = esEstudiante ? previo.estudiante_nombre : previo.propietario_nombre;
  if (!firmaService.nombreCoincide(firma, nombreDocumento)) {
    throw errorHttp(400, `Escribe tu nombre como aparece en tu documento: ${nombreDocumento}.`);
  }
  // F-2: firmar exige el código de un solo uso enviado al correo de quien firma
  const codigoUsado = await codigoFirma.usarCodigo(id, req.usuario.id, body.codigo);

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
    // Evidencias de la firma (tabla de solo adición)
    await cliente.query(
      `INSERT INTO firmas_contrato (contrato_id, usuario_id, rol, nombre_escrito, documento, firma_png, firma_sha256, consentimiento,
         codigo_id, codigo_enviado_a, pdf_sha256, ip, dispositivo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [id, req.usuario.id, esEstudiante ? 'arrendatario' : 'arrendador', firma,
        esEstudiante ? c.estudiante_documento : c.propietario_documento, imagenFirma.png, imagenFirma.sha256,
        firmaService.CONSENTIMIENTO, codigoUsado.id, codigoUsado.enviadoA, c.pdf_sha256,
        String(req.ip || '').slice(0, 64) || null, String((req.get && req.get('user-agent')) || '').slice(0, 300) || null]
    );

    const nota = `${esEstudiante ? 'El estudiante' : 'El propietario'} firmó el contrato #${id} con su firma manuscrita y el código enviado a su correo.`;
    await auditar({
      actor: req.usuario, accion: formalizado ? 'contrato_formalizado' : 'contrato_aceptado', entidad: 'contrato', entidadId: id,
      resumen: formalizado ? `${nota} Con esta aceptación quedó formalizado.` : nota,
      datos: { solicitud_id: c.solicitud_id, huella: c.huella, pdf_sha256: c.pdf_sha256, codigo_id: codigoUsado.id, codigo_enviado_a: codigoUsado.enviadoA, firma_sha256: imagenFirma.sha256 }, ip: req.ip
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
      `SELECT c.*, s.estado AS solicitud_estado, s.personas, i.barrio,
              to_char(c.fecha_inicio, 'YYYY-MM-DD') AS inicio_iso,
              to_char((c.fecha_inicio + make_interval(months => c.duracion_meses) - interval '1 day')::date, 'YYYY-MM-DD') AS fin_iso
       FROM contratos c JOIN solicitudes s ON s.id = c.solicitud_id JOIN inmuebles i ON i.id = c.inmueble_id
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
    // Un contrato de arrendamiento identifica a las partes con su documento
    const { rows: idens } = await cliente.query(
      'SELECT usuario_id, tipo, numero, nombre_completo FROM documentos_identidad WHERE usuario_id = ANY($1)',
      [[c.estudiante_id, c.propietario_id]]);
    const idEst = idens.find((r) => r.usuario_id === c.estudiante_id);
    const idProp = idens.find((r) => r.usuario_id === c.propietario_id);
    if (!idEst || !idProp) {
      const quien = !idEst && !idProp ? 'el estudiante ni el propietario han' : !idEst ? 'el estudiante no ha' : 'el propietario no ha';
      throw Object.assign(errorHttp(409, `No se puede enviar: ${quien} registrado su documento de identidad. Ya se le avisó.`),
        { faltan: [!idEst && c.estudiante_id, !idProp && c.propietario_id].filter(Boolean) });
    }
    // En el contrato van los nombres tal como aparecen en el documento
    c.estudiante_nombre = idEst.nombre_completo;
    c.propietario_nombre = idProp.nombre_completo;
    const docEst = contratoPdf.documentoTexto(idEst.tipo, idEst.numero);
    const docProp = contratoPdf.documentoTexto(idProp.tipo, idProp.numero);
    const ahora = new Date();
    const { pdf, sha256 } = await contratoPdf.generarPdf({
      contratoId: id,
      fechaEmision: new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10),
      arrendador: { nombre: idProp.nombre_completo, documento: docProp },
      arrendatario: { nombre: idEst.nombre_completo, documento: docEst },
      inmueble: { titulo: c.inmueble_titulo, direccion: c.inmueble_direccion, barrio: c.barrio },
      canon: c.canon_mensual, personas: c.personas || 1, diaPago: c.dia_pago, duracion: c.duracion_meses,
      fechaInicio: c.inicio_iso, fechaFin: c.fin_iso, servicios: c.servicios_incluidos, condiciones: c.condiciones
    }, ahora);
    const huella = calcularHuella(c);
    await cliente.query(
      `UPDATE contratos SET estado = 'enviado', enviado_en = now(), vence_en = now() + make_interval(days => $2), huella = $3,
         estudiante_nombre = $4, propietario_nombre = $5, estudiante_documento = $6, propietario_documento = $7,
         plantilla_version = $8, pdf_sha256 = $9
       WHERE id = $1`,
      [id, PLAZO_ACEPTACION_DIAS, huella, idEst.nombre_completo, idProp.nombre_completo, docEst, docProp, contratoPdf.PLANTILLA.version, sha256]
    );
    await cliente.query(
      `INSERT INTO contratos_documentos (contrato_id, tipo, pdf, sha256, bytes, plantilla_version) VALUES ($1, 'original', $2, $3, $4, $5)`,
      [id, pdf, sha256, pdf.length, contratoPdf.PLANTILLA.version]
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
    // A quien le falta el documento se le pide registrarlo
    for (const usuarioId of error.faltan || []) {
      await crearAviso({ usuarioId, tipo: 'solicitud', titulo: 'Registra tu documento para el contrato',
        cuerpo: 'Roumix necesita tu documento de identidad para preparar tu contrato de arriendo.', enlace: 'solicitudes.html#documento' });
    }
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

/**
 * GET /api/contratos/:id/pdf — el PDF sellado del contrato (las partes, si ya fue enviado, y el admin).
 * Se comprueba que el archivo guardado coincide con su huella antes de entregarlo.
 */
async function descargarPdf(req, res) {
  const id = idEntero(req.params.id);
  const { rows: [c] } = await db.query('SELECT id, estado, estudiante_id, propietario_id FROM contratos WHERE id = $1', [id]);
  if (req.usuario.rol !== 'admin') {
    const esParte = c && (req.usuario.rol === 'estudiante' ? c.estudiante_id : c.propietario_id) === req.usuario.id;
    if (!esParte || c.estado === 'borrador') throw errorHttp(404, 'No tienes un contrato con ese número.');
  } else if (!c) {
    throw errorHttp(404, `No existe el contrato ${id}.`);
  }
  const { rows: [d] } = await db.query(
    "SELECT tipo, pdf, sha256 FROM contratos_documentos WHERE contrato_id = $1 ORDER BY (tipo = 'firmado') DESC LIMIT 1", [id]);
  if (!d) throw errorHttp(404, 'Este contrato se envió antes de que Roumix generara PDF.');
  const integro = crypto.createHash('sha256').update(d.pdf).digest('hex') === d.sha256;
  if (!integro) throw errorHttp(500, 'El archivo guardado no coincide con su huella. Escríbele al equipo de Roumix.');
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="contrato-roumix-${id}${d.tipo === 'firmado' ? '-firmado' : ''}.pdf"`,
    'Cache-Control': 'private, no-store',
    'X-Roumix-Sha256': d.sha256
  });
  res.send(d.pdf);
}

module.exports = {
  descargarPdf,
  solicitarCodigo,
  crearCodigoFirma,
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
