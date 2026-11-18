/**
 * PDF firmado con certificado de firma electrónica (F-4).
 *
 * Cuando las dos partes firman, se toma el PDF ORIGINAL sellado (F-1), se estampan las
 * firmas dibujadas (F-3) en sus recuadros y se agrega una página de certificado con las
 * evidencias de cada firma y un código de verificación público.
 *
 * Por privacidad, el certificado (que reciben ambas partes) NO muestra la IP ni el
 * dispositivo de la otra persona: Roumix los conserva como evidencia.
 */
const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const db = require('../config/db');
const { PLANTILLA } = require('./contratoPdfService');
const { ocultarCorreo } = require('./codigoFirmaService');

const URL_VERIFICAR = 'https://roumix-eight.vercel.app/pages/verificar.html';
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // sin 0/O ni 1/I/L (no se confunden)

/** Código de verificación: RMX-XXXX-XXXX-XXXX (≈ 59 bits aleatorios) */
function nuevoCodigo() {
  const b = crypto.randomBytes(12);
  const c = [...b].map((x) => ALFABETO[x % ALFABETO.length]).join('');
  return `RMX-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

const limpio = (t) => String(t === null || t === undefined ? '' : t)
  .replace(/[   ]/g, ' ').replace(/[•●]/g, '*').replace(/[^\x20-\x7e¡-ÿ–—‘’“”]/g, '');
const momentoBogota = (d) => `${new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'medium' })} (hora de Colombia)`;
const ROLES = { arrendador: 'ARRENDADOR', arrendatario: 'ARRENDATARIO' };

/** Construye el PDF firmado. Devuelve { pdf: Buffer, sha256 }. */
async function generarPdfFirmado({ original, cajas, firmas, contrato, codigo, originalSha, consentimiento }) {
  const doc = await PDFDocument.load(original);
  const fecha = new Date(contrato.formalizado_en || Date.now());
  doc.setModificationDate(fecha);
  doc.setKeywords([`roumix`, `contrato-${contrato.id}`, codigo]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const verde = rgb(0.08, 0.13, 0.1);
  const naranja = rgb(0.77, 0.49, 0.17);
  const gris = rgb(0.36, 0.34, 0.31);
  const tinta = rgb(0.12, 0.12, 0.12);

  // 1. Firmas estampadas sobre su línea (si el PDF guardó dónde van)
  const imagenes = {};
  for (const f of firmas) imagenes[f.rol] = await doc.embedPng(f.firma_png);
  for (const caja of cajas || []) {
    const img = imagenes[caja.rol];
    const pagina = doc.getPages()[caja.pagina];
    if (!img || !pagina) continue;
    const escala = Math.min(caja.ancho / img.width, caja.alto / img.height);
    pagina.drawImage(img, { x: caja.x, y: caja.y, width: img.width * escala, height: img.height * escala });
  }

  // 2. Página de certificado
  const [ANCHO, ALTO] = [595.28, 841.89];
  const M = 56;
  const anchoTexto = ANCHO - 2 * M;
  let p = doc.addPage([ANCHO, ALTO]);
  let y = ALTO - M;
  function partir(texto, fuente, tam, ancho) {
    const lineas = [];
    let linea = '';
    for (const palabra of limpio(texto).split(/\s+/)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) { lineas.push(linea); linea = palabra; } else linea = prueba;
    }
    lineas.push(linea);
    return lineas;
  }
  function escribir(texto, { fuente = normal, tam = 9.5, color = tinta, x = M, ancho = anchoTexto, despues = 4 } = {}) {
    for (const linea of partir(texto, fuente, tam, ancho)) {
      if (y - tam < M + 24) { p = doc.addPage([ANCHO, ALTO]); y = ALTO - M; }
      p.drawText(linea, { x, y: y - tam, size: tam, font: fuente, color });
      y -= tam * 1.45;
    }
    y -= despues;
  }
  function dato(etiqueta, valor, opciones = {}) {
    p.drawText(limpio(etiqueta.toUpperCase()), { x: M, y: y - 8, size: 7.5, font: negrita, color: gris });
    escribir(valor, { x: M + 130, ancho: anchoTexto - 130, tam: 9.5, ...opciones });
  }

  p.drawRectangle({ x: 0, y: ALTO - 96, width: ANCHO, height: 96, color: verde });
  p.drawText('roumix', { x: M, y: ALTO - 60, size: 24, font: negrita, color: rgb(1, 1, 1) });
  p.drawText('.', { x: M + negrita.widthOfTextAtSize('roumix', 24), y: ALTO - 60, size: 24, font: negrita, color: naranja });
  const t1 = 'Certificado de firma electrónica';
  p.drawText(limpio(t1), { x: ANCHO - M - negrita.widthOfTextAtSize(limpio(t1), 12), y: ALTO - 52, size: 12, font: negrita, color: rgb(1, 1, 1) });
  const t2 = `Contrato #${contrato.id}`;
  p.drawText(t2, { x: ANCHO - M - normal.widthOfTextAtSize(t2, 9), y: ALTO - 68, size: 9, font: normal, color: rgb(1, 1, 1) });
  y = ALTO - 96 - 30;

  escribir('CERTIFICADO DE FIRMA ELECTRÓNICA', { fuente: negrita, tam: 14, color: verde, despues: 2 });
  escribir('Ley 527 de 1999 · Decreto 2364 de 2012 (compilado en el Decreto 1074 de 2015)', { tam: 8.5, color: gris, despues: 12 });

  // Código de verificación destacado
  p.drawRectangle({ x: M, y: y - 58, width: anchoTexto, height: 58, color: rgb(0.96, 0.94, 0.9), borderColor: rgb(0.85, 0.8, 0.7), borderWidth: 0.8 });
  p.drawText('CÓDIGO DE VERIFICACIÓN', { x: M + 14, y: y - 18, size: 7.5, font: negrita, color: gris });
  p.drawText(codigo, { x: M + 14, y: y - 40, size: 18, font: negrita, color: verde });
  const ayuda = limpio(`Verifícalo en ${URL_VERIFICAR.replace('https://', '')}`);
  p.drawText(ayuda, { x: M + 14, y: y - 52, size: 7.5, font: normal, color: gris });
  y -= 74;

  dato('Contrato', `Contrato de arrendamiento de vivienda urbana #${contrato.id} · ${contrato.inmueble_titulo}`);
  dato('Formalizado', momentoBogota(fecha));
  dato('Plantilla', `${contrato.plantilla_version || PLANTILLA.version}${(contrato.plantilla_version === PLANTILLA.version && PLANTILLA.revisada) ? ' (revisada)' : ' (pendiente de revisión legal)'}`);
  dato('Documento firmado', 'Huella SHA-256 del contrato enviado a las partes (las páginas anteriores, sin las firmas estampadas):');
  escribir(originalSha, { fuente: mono, tam: 8, x: M + 130, ancho: anchoTexto - 130, despues: 10 });

  escribir('FIRMANTES', { fuente: negrita, tam: 10, color: verde, despues: 6 });
  for (const f of firmas) {
    if (y - 150 < M + 24) { p = doc.addPage([ANCHO, ALTO]); y = ALTO - M; }
    const inicio = y;
    p.drawRectangle({ x: M, y: y - 128, width: anchoTexto, height: 128, borderColor: rgb(0.85, 0.8, 0.7), borderWidth: 0.6 });
    y -= 12;
    p.drawText(ROLES[f.rol] || f.rol.toUpperCase(), { x: M + 12, y: y - 8, size: 8, font: negrita, color: naranja });
    y -= 14;
    const img = imagenes[f.rol];
    const escala = Math.min(150 / img.width, 44 / img.height);
    p.drawImage(img, { x: ANCHO - M - 12 - img.width * escala, y: inicio - 12 - 44, width: img.width * escala, height: img.height * escala });
    escribir(`${f.nombre_escrito}${f.documento ? ` · ${f.documento}` : ''}`, { fuente: negrita, tam: 10, x: M + 12, ancho: anchoTexto - 190, despues: 2 });
    escribir(`Firmó el ${momentoBogota(f.firmado_en)}.`, { tam: 8.5, x: M + 12, ancho: anchoTexto - 190, despues: 2 });
    escribir(`Identificación: sesión en su cuenta de Roumix y código de un solo uso enviado a ${ocultarCorreo(f.codigo_enviado_a)}; firma manuscrita digitalizada.`,
      { tam: 8.5, x: M + 12, ancho: anchoTexto - 24, despues: 2 });
    escribir(`Huella de la firma (SHA-256): ${f.firma_sha256}`, { fuente: mono, tam: 7, x: M + 12, ancho: anchoTexto - 24, despues: 2 });
    escribir(`Documento que firmó (SHA-256): ${f.pdf_sha256 || '-'}`, { fuente: mono, tam: 7, x: M + 12, ancho: anchoTexto - 24, despues: 2 });
    y = inicio - 128 - 10;
  }

  escribir('CONSENTIMIENTO ACEPTADO POR CADA FIRMANTE', { fuente: negrita, tam: 9, color: verde, despues: 3 });
  escribir(`"${consentimiento}"`, { tam: 8.5, color: gris, despues: 10 });
  escribir('Roumix conserva además la dirección IP y el dispositivo desde donde se hizo cada firma, como evidencia que puede entregarse a una autoridad competente. Cualquier modificación de este archivo cambia su huella SHA-256 y se detecta en la página de verificación.',
    { tam: 8, color: gris, despues: 6 });
  if (!(contrato.plantilla_version === PLANTILLA.version && PLANTILLA.revisada)) {
    escribir('La plantilla de este contrato está pendiente de revisión legal.', { fuente: negrita, tam: 8, color: naranja });
  }
  const pie = limpio(`Certificado del contrato #${contrato.id} · ${codigo}`);
  p.drawText(pie, { x: M, y: 30, size: 7.5, font: normal, color: gris });

  const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  return { pdf: bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

/**
 * Genera y guarda el PDF firmado si el contrato está formalizado y aún no lo tiene.
 * Idempotente: si ya existe, lo devuelve. Devuelve null si no aplica (contratos anteriores
 * a F-1/F-3, sin PDF original o sin las dos firmas dibujadas).
 * { sha256, codigo, nuevo }
 */
async function asegurarPdfFirmado(contratoId, consentimiento) {
  const { rows: [c] } = await db.query(
    `SELECT c.id, c.estado, c.formalizado_en, c.plantilla_version, c.codigo_verificacion, c.inmueble_titulo,
            c.estudiante_id, c.propietario_id
     FROM contratos c WHERE c.id = $1`, [contratoId]);
  if (!c || c.estado !== 'formalizado') return null;
  const { rows: [hecho] } = await db.query("SELECT sha256 FROM contratos_documentos WHERE contrato_id = $1 AND tipo = 'firmado'", [contratoId]);
  if (hecho) return { sha256: hecho.sha256, codigo: c.codigo_verificacion, nuevo: false };
  const { rows: [orig] } = await db.query("SELECT pdf, sha256, cajas_firma, plantilla_version FROM contratos_documentos WHERE contrato_id = $1 AND tipo = 'original'", [contratoId]);
  if (!orig) return null;
  const { rows: firmas } = await db.query(
    `SELECT rol, nombre_escrito, documento, firma_png, firma_sha256, codigo_enviado_a, pdf_sha256, firmado_en, consentimiento
     FROM firmas_contrato WHERE contrato_id = $1 ORDER BY firmado_en`, [contratoId]);
  if (firmas.length < 2) return null;

  const codigo = c.codigo_verificacion || nuevoCodigo();
  const { pdf, sha256 } = await generarPdfFirmado({
    original: orig.pdf, cajas: orig.cajas_firma, firmas, contrato: { ...c, plantilla_version: c.plantilla_version || orig.plantilla_version },
    codigo, originalSha: orig.sha256, consentimiento: consentimiento || firmas[0].consentimiento
  });

  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: insertado } = await cliente.query(
      `INSERT INTO contratos_documentos (contrato_id, tipo, pdf, sha256, bytes, plantilla_version)
       VALUES ($1, 'firmado', $2, $3, $4, $5) ON CONFLICT (contrato_id, tipo) DO NOTHING RETURNING id`,
      [contratoId, pdf, sha256, pdf.length, orig.plantilla_version]);
    if (!insertado.length) {
      // Otro proceso lo generó al mismo tiempo: se usa el suyo
      await cliente.query('ROLLBACK');
      const { rows: [otro] } = await db.query("SELECT sha256 FROM contratos_documentos WHERE contrato_id = $1 AND tipo = 'firmado'", [contratoId]);
      const { rows: [cc] } = await db.query('SELECT codigo_verificacion FROM contratos WHERE id = $1', [contratoId]);
      return { sha256: otro.sha256, codigo: cc.codigo_verificacion, nuevo: false };
    }
    await cliente.query('UPDATE contratos SET codigo_verificacion = $2, pdf_firmado_sha256 = $3 WHERE id = $1', [contratoId, codigo, sha256]);
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
  return { sha256, codigo, nuevo: true, estudianteId: c.estudiante_id, propietarioId: c.propietario_id, inmueble: c.inmueble_titulo };
}

/** Datos públicos para verificar un documento por su código (sin datos personales completos). */
async function verificarPorCodigo(codigo) {
  const limpioCodigo = String(codigo || '').toUpperCase().replace(/\s+/g, '');
  if (!/^RMX-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(limpioCodigo)) return null;
  return datosPublicos('codigo_verificacion = $1', limpioCodigo);
}

/** Lo mismo, a partir de la huella SHA-256 del PDF firmado (para quien solo tiene el archivo). */
async function verificarPorHuella(sha256) {
  const h = String(sha256 || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) return null;
  return datosPublicos('pdf_firmado_sha256 = $1', h);
}

async function datosPublicos(condicion, valor) {
  const { rows: [c] } = await db.query(
    `SELECT id, estado, formalizado_en, plantilla_version, pdf_sha256, pdf_firmado_sha256, codigo_verificacion
     FROM contratos WHERE ${condicion} AND codigo_verificacion IS NOT NULL`, [valor]);
  if (!c) return null;
  const { rows: firmas } = await db.query('SELECT rol, nombre_escrito, firmado_en FROM firmas_contrato WHERE contrato_id = $1 ORDER BY firmado_en', [c.id]);
  // Solo iniciales: confirma quién firmó sin exponer nombres completos a cualquiera
  const iniciales = (n) => String(n || '').split(/\s+/).filter(Boolean).map((p) => `${p[0].toUpperCase()}.`).join(' ');
  return {
    codigo: c.codigo_verificacion,
    contrato: c.id,
    estado: c.estado,
    formalizadoEn: c.formalizado_en,
    plantilla: c.plantilla_version,
    plantillaRevisada: c.plantilla_version === PLANTILLA.version && PLANTILLA.revisada,
    sha256Firmado: c.pdf_firmado_sha256,
    sha256Original: c.pdf_sha256,
    firmantes: firmas.map((f) => ({ rol: f.rol, iniciales: iniciales(f.nombre_escrito), firmadoEn: f.firmado_en }))
  };
}

module.exports = { asegurarPdfFirmado, verificarPorCodigo, verificarPorHuella, generarPdfFirmado, nuevoCodigo, URL_VERIFICAR };
