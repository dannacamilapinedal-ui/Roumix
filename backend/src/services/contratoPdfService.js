/**
 * Contrato de arrendamiento de vivienda urbana en PDF (F-1).
 *
 * La plantilla sigue la estructura de la Ley 820 de 2003 (arrendamiento de vivienda urbana).
 * IMPORTANTE: mientras PLANTILLA.revisada sea false, el documento dice en todas sus páginas
 * que está PENDIENTE DE REVISIÓN LEGAL. Cuando un abogado (por ejemplo, un consultorio jurídico)
 * la revise: se ajusta el texto, se cambia la versión y se marca revisada con su nombre y fecha.
 * Los contratos ya enviados conservan la versión con la que se generaron.
 *
 * Se usa pdf-lib con la fuente Helvetica incorporada (no lee archivos: funciona en Vercel).
 */
const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PLANTILLA = {
  version: 'arriendo-vivienda-2027-01-borrador',
  revisada: false,
  revisadaPor: null,       // p. ej. 'Consultorio Jurídico Universidad Santo Tomás'
  revisadaEn: null
};

const CIUDAD = 'Villavicencio (Meta)';
const TIPOS_DOCUMENTO = { CC: 'C.C.', CE: 'C.E.', PPT: 'PPT', PA: 'Pasaporte' };

const pesos = (n) => `$${Number(n || 0).toLocaleString('es-CO')}`;
const fechaLarga = (iso) => {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
};
// La fuente estándar del PDF solo tiene caracteres latinos: se reemplaza lo demás
const limpio = (t) => String(t === null || t === undefined ? '' : t)
  .replace(/[   ]/g, ' ').replace(/[•●]/g, '-').replace(/[^\x20-\x7e¡-ÿ–—‘’“”]/g, '');

/** Texto del documento a partir de su número formateado: "C.C. 1.121.000.000" */
function documentoTexto(tipo, numero) {
  const n = /^\d+$/.test(numero) ? Number(numero).toLocaleString('es-CO') : numero;
  return `${TIPOS_DOCUMENTO[tipo] || tipo} ${n}`;
}

/** Cláusulas del contrato. d = datos ya validados del contrato y las partes. */
function clausulas(d) {
  const lista = [
    ['PARTES', [
      `ARRENDADOR: ${d.arrendador.nombre}, identificado(a) con ${d.arrendador.documento}.`,
      `ARRENDATARIO: ${d.arrendatario.nombre}, identificado(a) con ${d.arrendatario.documento}.`,
      'Las partes celebran el presente contrato de arrendamiento de vivienda urbana, que se rige por la Ley 820 de 2003 y, en lo no previsto, por el Código Civil.'
    ]],
    ['PRIMERA. OBJETO', [
      `El ARRENDADOR entrega a título de arrendamiento al ARRENDATARIO el inmueble "${d.inmueble.titulo}", ubicado en ${d.inmueble.direccion || 'la dirección que consta en la plataforma Roumix'}${d.inmueble.barrio ? `, barrio ${d.inmueble.barrio}` : ''}, ${CIUDAD}.`,
      `El inmueble se destinará exclusivamente a vivienda del ARRENDATARIO${d.personas > 1 ? ` y de hasta ${d.personas} personas en total` : ''}. No podrá destinarse a otro uso ni subarrendarse o cederse sin autorización escrita del ARRENDADOR.`
    ]],
    ['SEGUNDA. CANON DE ARRENDAMIENTO', [
      `El canon mensual es de ${pesos(d.canon)} pesos colombianos.`,
      `Todos los cánones se pagan a través de la plataforma Roumix. El primer mes se paga antes de la entrega del inmueble. Los meses siguientes se pagan por débito automático, que el ARRENDATARIO activa en Roumix después de pagar el primer mes, con una tarjeta o una cuenta Nequi a su elección; el cobro se hace el día ${d.diaPago} de cada mes. El ARRENDATARIO puede cambiar el medio de pago, pero no desactivar el débito mientras el contrato esté vigente.`,
      'Las partes no harán pagos del canon por fuera de Roumix. Un pago hecho por otro medio no libera a ninguna de las partes de lo previsto en este contrato.',
      'El canon podrá reajustarse cada doce (12) meses de ejecución del contrato, en una proporción que no supere el cien por ciento (100 %) del incremento del índice de precios al consumidor (IPC) del año calendario anterior, de acuerdo con el artículo 20 de la Ley 820 de 2003.'
    ]],
    ['TERCERA. TÉRMINO', [
      `El término del contrato es de ${d.duracion} ${d.duracion === 1 ? 'mes' : 'meses'}, contados desde el ${fechaLarga(d.fechaInicio)} hasta el ${fechaLarga(d.fechaFin)}.`,
      'Vencido el término, el contrato se prorrogará en las condiciones previstas en la Ley 820 de 2003, salvo que alguna de las partes manifieste lo contrario con el preaviso que la ley exige.'
    ]],
    ['CUARTA. SERVICIOS PÚBLICOS', [
      d.servicios
        ? `El canon incluye los siguientes servicios: ${d.servicios}. Los servicios no incluidos y su consumo estarán a cargo del ARRENDATARIO.`
        : 'Los servicios públicos domiciliarios del inmueble estarán a cargo del ARRENDATARIO, salvo acuerdo distinto que conste en las condiciones particulares.'
    ]],
    ['QUINTA. OBLIGACIONES DEL ARRENDADOR', [
      'Entregar el inmueble en la fecha convenida, en buen estado de servicio, seguridad y sanidad; mantenerlo en ese estado durante el contrato y hacer las reparaciones necesarias que no sean locativas; y las demás previstas en el artículo 8 de la Ley 820 de 2003.'
    ]],
    ['SEXTA. OBLIGACIONES DEL ARRENDATARIO', [
      'Pagar el canon en el tiempo y forma convenidos; cuidar el inmueble y hacer las reparaciones locativas derivadas del uso; pagar los servicios a su cargo; respetar las normas de convivencia; restituir el inmueble al terminar el contrato en el estado en que lo recibió, salvo el deterioro natural por el uso legítimo; y las demás previstas en el artículo 9 de la Ley 820 de 2003.'
    ]],
    ['SÉPTIMA. GARANTÍAS', [
      'De conformidad con el artículo 16 de la Ley 820 de 2003, no se exige al ARRENDATARIO depósito en dinero efectivo ni otra clase de caución real para garantizar el cumplimiento de sus obligaciones.'
    ]],
    ['OCTAVA. MORA', [
      'El retardo en el pago del canon tendrá las consecuencias previstas en la ley y en este contrato. Roumix no cobra recargos por mora.'
    ]],
    ['NOVENA. TERMINACIÓN', [
      'El contrato podrá terminarse por mutuo acuerdo o por las causales y con los preavisos previstos en los artículos 22 a 25 de la Ley 820 de 2003. Los avisos entre las partes se envían a través de la plataforma Roumix.'
    ]],
    ['DÉCIMA. INTERMEDIACIÓN DE ROUMIX', [
      'Roumix es una plataforma de intermediación para vivienda universitaria y no es parte de este contrato. Gestiona la comunicación entre las partes, el envío y la firma electrónica del contrato y el recaudo de pagos a través de la pasarela Wompi.',
      'Roumix no comparte los datos de contacto de una parte con la otra. La comisión de Roumix está a cargo del ARRENDADOR; el ARRENDATARIO no paga costos adicionales a Roumix.'
    ]],
    ['DÉCIMA PRIMERA. FIRMA ELECTRÓNICA', [
      'Las partes aceptan firmar este contrato electrónicamente, con plena validez de acuerdo con la Ley 527 de 1999 y el Decreto 2364 de 2012 (compilado en el Decreto 1074 de 2015).',
      'El mecanismo identifica a cada firmante con su cuenta y un código de un solo uso enviado a su correo confirmado, registra su firma manuscrita digitalizada, la fecha, la hora y el dispositivo, y vincula la firma a este documento mediante su huella SHA-256. Cualquier modificación posterior del documento se puede detectar.'
    ]],
    ['DÉCIMA SEGUNDA. DATOS PERSONALES', [
      'Los datos de las partes se tratan según la Ley 1581 de 2012 y la Política de Tratamiento de Datos de Roumix, solo para la ejecución de este contrato.'
    ]]
  ];
  if (d.condiciones) lista.splice(lista.length - 2, 0, ['CONDICIONES PARTICULARES', [d.condiciones]]);
  return lista.map(([titulo, parrafos]) => ({ titulo, parrafos }));
}

/**
 * Genera el PDF del contrato. Devuelve { pdf: Buffer, sha256 }.
 * fechaDocumento fija la fecha interna del PDF (la del envío).
 */
async function generarPdf(d, fechaDocumento = new Date()) {
  const doc = await PDFDocument.create();
  doc.setTitle(limpio(`Contrato de arrendamiento #${d.contratoId} - Roumix`));
  doc.setAuthor('Roumix');
  doc.setSubject('Contrato de arrendamiento de vivienda urbana (Ley 820 de 2003)');
  doc.setProducer('Roumix');
  doc.setCreator('Roumix');
  doc.setCreationDate(fechaDocumento);
  doc.setModificationDate(fechaDocumento);

  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const verde = rgb(0.08, 0.13, 0.1);
  const naranja = rgb(0.77, 0.49, 0.17);
  const gris = rgb(0.36, 0.34, 0.31);
  const [ANCHO, ALTO] = [595.28, 841.89];
  const M = 56;
  const anchoTexto = ANCHO - 2 * M;

  let pagina;
  let y;
  function nuevaPagina() {
    pagina = doc.addPage([ANCHO, ALTO]);
    y = ALTO - M;
    if (!PLANTILLA.revisada) {
      pagina.drawText('PLANTILLA PENDIENTE DE REVISIÓN LEGAL', { x: M, y: ALTO - 30, size: 8, font: negrita, color: naranja });
    }
  }
  function partir(texto, fuente, tam, ancho = anchoTexto) {
    const lineas = [];
    for (const parrafo of limpio(texto).split('\n')) {
      let linea = '';
      for (const palabra of parrafo.split(/\s+/)) {
        const prueba = linea ? `${linea} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) {
          lineas.push(linea);
          linea = palabra;
        } else {
          linea = prueba;
        }
      }
      lineas.push(linea);
    }
    return lineas;
  }
  function escribir(texto, { fuente = normal, tam = 10, color = rgb(0.12, 0.12, 0.12), interlineado = 1.45, antes = 0, despues = 6, x = M, ancho = anchoTexto } = {}) {
    y -= antes;
    for (const linea of partir(texto, fuente, tam, ancho)) {
      if (y - tam < M + 20) nuevaPagina();
      pagina.drawText(linea, { x, y: y - tam, size: tam, font: fuente, color });
      y -= tam * interlineado;
    }
    y -= despues;
  }

  nuevaPagina();
  // Encabezado
  pagina.drawRectangle({ x: 0, y: ALTO - 96, width: ANCHO, height: 96, color: verde });
  pagina.drawText('roumix', { x: M, y: ALTO - 60, size: 24, font: negrita, color: rgb(1, 1, 1) });
  pagina.drawText('.', { x: M + negrita.widthOfTextAtSize('roumix', 24), y: ALTO - 60, size: 24, font: negrita, color: naranja });
  pagina.drawText(limpio(`Contrato #${d.contratoId}`), { x: ANCHO - M - negrita.widthOfTextAtSize(`Contrato #${d.contratoId}`, 11), y: ALTO - 52, size: 11, font: negrita, color: rgb(1, 1, 1) });
  const subt = limpio(`Emitido el ${fechaLarga(d.fechaEmision)}`);
  pagina.drawText(subt, { x: ANCHO - M - normal.widthOfTextAtSize(subt, 9), y: ALTO - 68, size: 9, font: normal, color: rgb(1, 1, 1) });
  y = ALTO - 96 - 32;

  escribir('CONTRATO DE ARRENDAMIENTO DE VIVIENDA URBANA', { fuente: negrita, tam: 15, color: verde, despues: 4 });
  escribir(`${CIUDAD} · Ley 820 de 2003`, { tam: 9, color: gris, despues: 14 });

  if (!PLANTILLA.revisada) {
    const aviso = 'Esta plantilla todavía no ha sido revisada por un abogado. Roumix la publica para pruebas del proyecto: antes de usarla en arriendos reales debe revisarla un profesional del derecho.';
    const lineas = partir(aviso, normal, 8.5, anchoTexto - 20);
    const alto = lineas.length * 8.5 * 1.45 + 26;
    pagina.drawRectangle({ x: M, y: y - alto, width: anchoTexto, height: alto, color: rgb(1, 0.96, 0.87), borderColor: rgb(0.85, 0.71, 0.35), borderWidth: 0.8 });
    pagina.drawText('PENDIENTE DE REVISIÓN LEGAL', { x: M + 10, y: y - 16, size: 8.5, font: negrita, color: rgb(0.42, 0.29, 0) });
    let yy = y - 30;
    for (const linea of lineas) { pagina.drawText(linea, { x: M + 10, y: yy, size: 8.5, font: normal, color: rgb(0.42, 0.29, 0) }); yy -= 8.5 * 1.45; }
    y -= alto + 16;
  }

  for (const c of clausulas(d)) {
    escribir(c.titulo, { fuente: negrita, tam: 10, color: verde, antes: 4, despues: 3 });
    for (const p of c.parrafos) escribir(p, { tam: 9.5 });
  }

  // Bloque de firmas (las firmas se estampan al firmar; ver F-4)
  escribir('FIRMAS', { fuente: negrita, tam: 10, color: verde, antes: 10, despues: 4 });
  escribir('Este contrato se firma electrónicamente a través de Roumix. El documento firmado incluye un certificado con las evidencias de cada firma.', { tam: 8.5, color: gris, despues: 12 });
  if (y - 90 < M + 20) nuevaPagina();
  const col = anchoTexto / 2 - 10;
  const cajasFirma = [];
  for (const [i, [rol, parte]] of [['ARRENDADOR', d.arrendador], ['ARRENDATARIO', d.arrendatario]].entries()) {
    const x = M + i * (col + 20);
    // Recuadro donde se estampará la firma dibujada (F-4): justo encima de la línea
    cajasFirma.push({ rol: rol.toLowerCase(), pagina: doc.getPages().indexOf(pagina), x, y: y - 48, ancho: col, alto: 44 });
    pagina.drawLine({ start: { x, y: y - 50 }, end: { x: x + col, y: y - 50 }, thickness: 0.8, color: gris });
    pagina.drawText(limpio(parte.nombre), { x, y: y - 64, size: 9.5, font: negrita, color: rgb(0.12, 0.12, 0.12) });
    pagina.drawText(limpio(`${parte.documento} · ${rol}`), { x, y: y - 77, size: 8.5, font: normal, color: gris });
  }
  y -= 96;

  // Pie de página con número de página y versión de la plantilla
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    const pie = limpio(`Contrato #${d.contratoId} · Plantilla ${PLANTILLA.version} · Página ${i + 1} de ${paginas.length}`);
    p.drawText(pie, { x: M, y: 30, size: 7.5, font: normal, color: gris });
  });

  const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  return { pdf: bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), cajasFirma };
}

module.exports = { PLANTILLA, TIPOS_DOCUMENTO, generarPdf, clausulas, documentoTexto };
