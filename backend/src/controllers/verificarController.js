/**
 * Verificación PÚBLICA de contratos firmados (F-4).
 *
 * Cualquiera que tenga el código de verificación (está en la página de certificado del PDF)
 * o el propio archivo puede comprobar que el contrato existe en Roumix, que fue firmado por
 * ambas partes y que el archivo no cambió. No se muestran nombres completos, documentos,
 * correos ni datos del inmueble: solo iniciales, fechas y huellas.
 *
 * Las búsquedas fallidas tienen un límite por IP para que no se puedan probar códigos al azar.
 */
const limites = require('../services/limitesService');
const { verificarPorCodigo, verificarPorHuella } = require('../services/contratoFirmadoService');

const MAX_FALLIDAS = 20;
const VENTANA_MINUTOS = 15;

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function revisarLimite(req) {
  const clave = `verificar:${limites.huella(req.ip)}`;
  const { total, primera } = await limites.contar(clave, VENTANA_MINUTOS);
  if (total >= MAX_FALLIDAS) {
    throw errorHttp(429, `Demasiadas búsquedas sin resultado. Intenta de nuevo en ${limites.minutosRestantes(primera, VENTANA_MINUTOS)} minutos.`);
  }
  return clave;
}

async function responder(req, res, buscar, noEncontrado) {
  const clave = await revisarLimite(req);
  const datos = await buscar();
  res.set('Cache-Control', 'no-store');
  if (!datos) {
    await limites.registrar(clave);
    throw errorHttp(404, noEncontrado);
  }
  res.json({ status: 'success', data: datos });
}

/** GET /api/verificar/:codigo */
async function porCodigo(req, res) {
  await responder(req, res, () => verificarPorCodigo(req.params.codigo),
    'No encontramos un contrato firmado con ese código. Revisa que esté completo (RMX-XXXX-XXXX-XXXX).');
}

/** GET /api/verificar/huella/:sha256 — para quien solo tiene el archivo */
async function porHuella(req, res) {
  if (!/^[0-9a-f]{64}$/i.test(String(req.params.sha256 || ''))) throw errorHttp(400, 'La huella no es válida.');
  await responder(req, res, () => verificarPorHuella(req.params.sha256),
    'Este archivo no coincide con ningún contrato firmado en Roumix. Puede haber sido modificado o no ser el PDF firmado.');
}

module.exports = { porCodigo, porHuella };
