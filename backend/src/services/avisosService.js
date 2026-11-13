/**
 * Novedades dentro de la plataforma (la "campanita" de cada usuario).
 * Complementan los correos: un correo puede no llegar, el aviso queda guardado.
 * Nunca lanza error: un aviso que no se guarda no debe tumbar la operación principal.
 */
const db = require('../config/db');

const recortar = (texto, max) => {
  if (texto === undefined || texto === null) return null;
  const limpio = String(texto).replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio || null;
};

async function crearAviso({ usuarioId, tipo, titulo, cuerpo = null, enlace = null }, cliente = db) {
  if (!usuarioId) return false;
  try {
    await cliente.query(
      'INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, enlace) VALUES ($1, $2, $3, $4, $5)',
      [usuarioId, tipo, recortar(titulo, 150), recortar(cuerpo, 500), enlace]
    );
    return true;
  } catch (error) {
    console.error('⚠️ No se pudo guardar el aviso:', error.message);
    return false;
  }
}

module.exports = { crearAviso };
