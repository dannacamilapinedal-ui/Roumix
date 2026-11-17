/**
 * Firma manuscrita digitalizada (F-3).
 *
 * La persona dibuja su firma en la página (lienzo transparente, trazo oscuro) y llega como
 * imagen PNG. Aquí se comprueba que sea un PNG real, de tamaño razonable y que tenga trazos
 * (no una imagen vacía), y que el nombre escrito corresponda al del documento.
 */
const zlib = require('zlib');
const crypto = require('crypto');

// Texto exacto que acepta quien firma (queda guardado con cada firma como evidencia)
const CONSENTIMIENTO = 'Leí el contrato completo y acepto firmarlo electrónicamente con mi nombre, mi firma manuscrita digitalizada y el código de un solo uso enviado a mi correo, con la misma validez de una firma a mano (Ley 527 de 1999 y Decreto 2364 de 2012).';

const MAX_BYTES = 300 * 1024;
const MIN_TINTA = 150;   // bytes con trazo (alfa distinto de cero) que debe tener la firma

function errorHttp(status, message) {
  return Object.assign(new Error(message), { status });
}

/** Valida la imagen "data:image/png;base64,…" y devuelve { png: Buffer, sha256 }. */
function validarImagen(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw errorHttp(400, 'Dibuja tu firma en el recuadro antes de firmar.');
  const png = Buffer.from(m[1], 'base64');
  if (png.length > MAX_BYTES) throw errorHttp(413, 'La imagen de la firma es demasiado pesada.');
  if (png.length < 60 || png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw errorHttp(400, 'La firma no es una imagen válida. Vuelve a dibujarla.');
  }
  // Recorre los bloques del PNG: IHDR (tamaño) e IDAT (los píxeles comprimidos)
  let pos = 8;
  let ancho = 0;
  let alto = 0;
  let tipoColor = -1;
  const datos = [];
  while (pos + 8 <= png.length) {
    const largo = png.readUInt32BE(pos);
    const tipo = png.toString('latin1', pos + 4, pos + 8);
    const contenido = png.subarray(pos + 8, pos + 8 + largo);
    if (tipo === 'IHDR') { ancho = contenido.readUInt32BE(0); alto = contenido.readUInt32BE(4); tipoColor = contenido[9]; }
    if (tipo === 'IDAT') datos.push(contenido);
    if (tipo === 'IEND') break;
    pos += 12 + largo;
  }
  if (ancho < 200 || ancho > 2400 || alto < 60 || alto > 1200) throw errorHttp(400, 'El tamaño de la firma no es válido. Vuelve a dibujarla.');
  if (tipoColor !== 6) throw errorHttp(400, 'La firma debe dibujarse en el recuadro de Roumix.');
  let pixeles;
  try {
    pixeles = zlib.inflateSync(Buffer.concat(datos));
  } catch (e) {
    throw errorHttp(400, 'La firma no es una imagen válida. Vuelve a dibujarla.');
  }
  // Con fondo transparente, un recuadro vacío tiene todos sus bytes en cero
  let tinta = 0;
  for (let i = 0; i < pixeles.length && tinta < MIN_TINTA; i++) if (pixeles[i] !== 0 && i % (ancho * 4 + 1) !== 0) tinta++;
  if (tinta < MIN_TINTA) throw errorHttp(400, 'Tu firma está vacía o es muy pequeña. Dibújala en el recuadro.');
  return { png, sha256: crypto.createHash('sha256').update(png).digest('hex') };
}

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * El nombre escrito debe empezar por el primer nombre del documento y tener al menos dos palabras.
 * (Permite omitir un segundo nombre o apellido, pero no firmar con un nombre ajeno.)
 */
function nombreCoincide(escrito, nombreDocumento) {
  const e = normalizar(escrito);
  const d = normalizar(nombreDocumento);
  if (!d) return true;
  if (e.split(' ').length < 2) return false;
  const palabrasDoc = d.split(' ');
  return e.split(' ')[0] === palabrasDoc[0] && e.split(' ').slice(1).some((p) => palabrasDoc.includes(p));
}

module.exports = { CONSENTIMIENTO, validarImagen, nombreCoincide };
