/**
 * Documento de identidad del usuario (para identificar a las partes en el contrato).
 *
 * GET /api/identidad   → si ya lo registró (el número se muestra parcialmente)
 * PUT /api/identidad   { tipo, numero, nombreCompleto }
 *
 * Solo lo ve el propio usuario y el equipo de Roumix; la otra parte lo ve únicamente
 * dentro del contrato, como exige un contrato de arrendamiento.
 */
const db = require('../config/db');
const { TIPOS_DOCUMENTO } = require('../services/contratoPdfService');

const REGLAS = {
  CC: { patron: /^\d{5,10}$/, ayuda: 'La cédula de ciudadanía tiene entre 5 y 10 dígitos, sin puntos.' },
  CE: { patron: /^\d{6,10}$/, ayuda: 'La cédula de extranjería tiene entre 6 y 10 dígitos.' },
  PPT: { patron: /^\d{6,12}$/, ayuda: 'El número del PPT tiene entre 6 y 12 dígitos.' },
  PA: { patron: /^[A-Za-z0-9]{5,20}$/, ayuda: 'El pasaporte tiene entre 5 y 20 letras o números.' }
};

function errorHttp(status, message) {
  return Object.assign(new Error(message), { status });
}

const ocultar = (numero) => `•••• ${String(numero).slice(-4)}`;

async function identidadDe(usuarioId, cliente = db) {
  const { rows } = await cliente.query('SELECT tipo, numero, nombre_completo, actualizado_en FROM documentos_identidad WHERE usuario_id = $1', [usuarioId]);
  return rows[0] || null;
}

/** GET /api/identidad */
async function ver(req, res) {
  const d = await identidadDe(req.usuario.id);
  res.json({
    status: 'success',
    data: d
      ? { registrado: true, tipo: d.tipo, tipoTexto: TIPOS_DOCUMENTO[d.tipo], numero: ocultar(d.numero), nombreCompleto: d.nombre_completo, actualizadoEn: d.actualizado_en }
      : { registrado: false },
    tipos: TIPOS_DOCUMENTO
  });
}

/** PUT /api/identidad */
async function guardar(req, res) {
  const b = req.body || {};
  const tipo = String(b.tipo || '').toUpperCase();
  const numero = String(b.numero || '').replace(/[\s.-]/g, '').toUpperCase();
  const nombre = String(b.nombreCompleto || '').trim().replace(/\s+/g, ' ');
  if (!REGLAS[tipo]) throw errorHttp(400, 'Elige el tipo de documento.');
  if (!REGLAS[tipo].patron.test(numero)) throw errorHttp(400, REGLAS[tipo].ayuda);
  if (nombre.length < 5 || nombre.length > 120 || !/^[\p{L}' .-]+$/u.test(nombre) || nombre.split(' ').length < 2) {
    throw errorHttp(400, 'Escribe tu nombre completo como aparece en el documento (nombres y apellidos).');
  }
  try {
    await db.query(
      `INSERT INTO documentos_identidad (usuario_id, tipo, numero, nombre_completo) VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id) DO UPDATE SET tipo = EXCLUDED.tipo, numero = EXCLUDED.numero,
         nombre_completo = EXCLUDED.nombre_completo, actualizado_en = now()`,
      [req.usuario.id, tipo, numero, nombre]);
  } catch (error) {
    if (error.code === '23505') throw errorHttp(409, 'Ese documento ya está registrado en otra cuenta de Roumix. Si es tuyo, escríbele al equipo.');
    throw error;
  }
  res.json({ status: 'success', message: 'Guardamos tu documento. Aparecerá en tus contratos de arriendo.', data: { registrado: true, tipo, numero: ocultar(numero), nombreCompleto: nombre } });
}

module.exports = { ver, guardar, identidadDe };
