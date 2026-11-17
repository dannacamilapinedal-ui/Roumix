// Utilidades de las pruebas para la firma manuscrita (F-3).
// No es una prueba (no termina en .test.js): la usan las pruebas que firman contratos.
const zlib = require('zlib');

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(cuerpo) >>> 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

/** PNG RGBA de ancho×alto con fondo transparente; si conTinta, dibuja un trazo diagonal oscuro. */
function pngFirma({ ancho = 400, alto = 120, conTinta = true } = {}) {
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 4);              // byte de filtro 0 + píxeles transparentes
    if (conTinta) {
      for (let x = 20; x < ancho - 20; x++) {
        if (Math.abs(y - Math.round(20 + ((alto - 40) * (x - 20)) / (ancho - 40))) <= 2) {
          fila.writeUInt32BE(0x1e392aff, 1 + x * 4);       // verde oscuro, opaco
        }
      }
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8 bits, RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(Buffer.concat(filas))),
    bloque('IEND', Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const firmaPrueba = pngFirma();

/** Borra las firmas de los contratos de un inmueble de prueba (la tabla es de solo adición). */
async function borrarFirmasDePrueba(db, inmuebleId) {
  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("SET LOCAL roumix.pruebas = 'si'");
    await cliente.query('DELETE FROM firmas_contrato WHERE contrato_id IN (SELECT id FROM contratos WHERE inmueble_id = $1)', [inmuebleId]);
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = { pngFirma, firmaPrueba, borrarFirmasDePrueba };
