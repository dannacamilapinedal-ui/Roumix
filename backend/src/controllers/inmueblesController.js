const db = require('../config/db');

const TIPOS = ['habitacion', 'apartaestudio', 'apartamento'];
const TIPO_LABELS = { habitacion: 'Habitación', apartaestudio: 'Apartaestudio', apartamento: 'Apartamento' };

// Columnas públicas de un inmueble + datos de contacto tomados del perfil del propietario
const SELECT_INMUEBLE = `
  SELECT i.id, i.propietario_id, i.titulo, i.tipo, i.tipo_label, i.precio, i.barrio,
         i.universidad, i.distancia_texto, i.distancia_metros, i.tiempo_pie, i.estrato,
         i.area, i.transporte, i.amenidades, i.descripcion, i.deposito, i.contrato_minimo,
         i.disponible_desde, i.latitud, i.longitud, i.imagen_principal, i.galeria,
         i.estado, i.created_at, i.updated_at,
         u.nombre AS propietario_nombre, u.telefono AS propietario_telefono
  FROM inmuebles i
  LEFT JOIN usuarios u ON u.id = i.propietario_id
`;

function errorValidacion(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function textoOpcional(valor, campo, max) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw errorValidacion(`${campo} debe ser texto.`);
  const limpio = valor.trim();
  if (limpio.length > max) throw errorValidacion(`${campo} admite máximo ${max} caracteres.`);
  return limpio || null;
}

function textoObligatorio(valor, campo, max) {
  const limpio = textoOpcional(valor, campo, max);
  if (!limpio) throw errorValidacion(`${campo} es obligatorio.`);
  return limpio;
}

function enteroOpcional(valor, campo, min, max) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw errorValidacion(`${campo} debe ser un entero entre ${min} y ${max}.`);
  return n;
}

function numeroOpcional(valor, campo, min, max) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) throw errorValidacion(`${campo} no es válido.`);
  return n;
}

function listaTextos(valor, campo, maxItems, maxLargo) {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || valor.length > maxItems) throw errorValidacion(`${campo} debe ser una lista de máximo ${maxItems} elementos.`);
  return valor.map((v) => textoObligatorio(v, campo, maxLargo));
}

function urlOpcional(valor, campo) {
  const url = textoOpcional(valor, campo, 1000);
  if (url && !/^https:\/\//i.test(url)) throw errorValidacion(`${campo} debe ser una URL https.`);
  return url;
}

/**
 * Valida y normaliza los datos de un inmueble recibidos del formulario.
 * Los datos del propietario NO se leen del cuerpo: salen de la sesión.
 */
function validarInmueble(body) {
  const tipo = textoObligatorio(body.tipo, 'tipo', 30);
  if (!TIPOS.includes(tipo)) throw errorValidacion(`tipo debe ser uno de: ${TIPOS.join(', ')}.`);

  const precio = enteroOpcional(body.precio, 'precio', 1, 100000000);
  if (precio === null) throw errorValidacion('precio es obligatorio.');

  const galeria = listaTextos(body.galeria, 'galeria', 10, 1000);
  galeria.forEach((url) => urlOpcional(url, 'galeria'));
  const imagenPrincipal = urlOpcional(body.imagenPrincipal, 'imagenPrincipal') || galeria[0] || null;

  return {
    titulo: textoObligatorio(body.titulo, 'titulo', 200),
    tipo,
    tipoLabel: TIPO_LABELS[tipo],
    precio,
    barrio: textoObligatorio(body.barrio, 'barrio', 100),
    universidad: textoOpcional(body.universidad, 'universidad', 100) || 'Santo Tomás',
    distanciaTexto: textoOpcional(body.distanciaTexto, 'distanciaTexto', 150),
    distanciaMetros: enteroOpcional(body.distanciaMetros, 'distanciaMetros', 0, 100000),
    tiempoPie: textoOpcional(body.tiempoPie, 'tiempoPie', 50),
    estrato: enteroOpcional(body.estrato, 'estrato', 1, 6),
    area: textoOpcional(body.area, 'area', 30),
    transporte: textoOpcional(body.transporte, 'transporte', 150),
    amenidades: listaTextos(body.amenidades, 'amenidades', 20, 50),
    descripcion: textoOpcional(body.descripcion, 'descripcion', 3000),
    deposito: textoOpcional(body.deposito, 'deposito', 100),
    contratoMinimo: textoOpcional(body.contratoMinimo, 'contratoMinimo', 50),
    disponibleDesde: textoOpcional(body.disponibleDesde, 'disponibleDesde', 50) || 'Inmediato',
    latitud: numeroOpcional(body.latitud, 'latitud', -90, 90),
    longitud: numeroOpcional(body.longitud, 'longitud', -180, 180),
    imagenPrincipal,
    galeria: galeria.length ? galeria : (imagenPrincipal ? [imagenPrincipal] : [])
  };
}

/**
 * GET /api/inmuebles
 * Lista los inmuebles disponibles con filtros opcionales
 */
async function getInmuebles(req, res) {
  const { tipo, precioMax, universidad, q } = req.query;

  let queryText = `${SELECT_INMUEBLE} WHERE i.estado = $1`;
  const queryParams = ['disponible'];

  if (tipo && tipo !== 'todos') {
    if (!TIPOS.includes(tipo)) throw errorValidacion('Filtro tipo no válido.');
    queryParams.push(tipo);
    queryText += ` AND i.tipo = $${queryParams.length}`;
  }

  if (precioMax) {
    const max = enteroOpcional(precioMax, 'precioMax', 1, 100000000);
    queryParams.push(max);
    queryText += ` AND i.precio <= $${queryParams.length}`;
  }

  if (universidad && universidad !== 'todas') {
    queryParams.push(`%${String(universidad).slice(0, 100)}%`);
    queryText += ` AND i.universidad ILIKE $${queryParams.length}`;
  }

  if (q) {
    queryParams.push(`%${String(q).slice(0, 100)}%`);
    queryText += ` AND (i.titulo ILIKE $${queryParams.length} OR i.barrio ILIKE $${queryParams.length})`;
  }

  queryText += ' ORDER BY i.created_at DESC, i.id DESC';

  const result = await db.query(queryText, queryParams);

  res.status(200).json({
    status: 'success',
    total: result.rowCount,
    data: result.rows
  });
}

/**
 * GET /api/inmuebles/:id
 * Detalle de un inmueble disponible
 */
async function getInmueblePorId(req, res) {
  const id = enteroOpcional(req.params.id, 'id', 1, 2147483647);
  if (id === null) throw errorValidacion('id no válido.');

  const result = await db.query(`${SELECT_INMUEBLE} WHERE i.id = $1 AND i.estado = 'disponible'`, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({
      status: 'error',
      message: `Inmueble con ID ${id} no encontrado o no disponible`
    });
  }

  res.status(200).json({
    status: 'success',
    data: result.rows[0]
  });
}

/**
 * GET /api/inmuebles/mios
 * Inmuebles del propietario autenticado, identificado por su ID de sesión
 */
async function getMisInmuebles(req, res) {
  const result = await db.query(
    `${SELECT_INMUEBLE} WHERE i.propietario_id = $1 ORDER BY i.created_at DESC, i.id DESC`,
    [req.usuario.id]
  );

  res.status(200).json({
    status: 'success',
    total: result.rowCount,
    data: result.rows
  });
}

/**
 * POST /api/inmuebles
 * Crea un inmueble del propietario autenticado (requireAuth + requireRol('propietario'))
 */
async function crearInmueble(req, res) {
  const d = validarInmueble(req.body || {});

  const result = await db.query(
    `INSERT INTO inmuebles (
       propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad,
       distancia_texto, distancia_metros, tiempo_pie, estrato, area,
       transporte, amenidades, descripcion, deposito, contrato_minimo, disponible_desde,
       latitud, longitud, imagen_principal, galeria, estado
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18,
       $19, $20, $21, $22, 'disponible'
     ) RETURNING id`,
    [
      req.usuario.id, d.titulo, d.tipo, d.tipoLabel, d.precio, d.barrio, d.universidad,
      d.distanciaTexto, d.distanciaMetros, d.tiempoPie, d.estrato, d.area,
      d.transporte, d.amenidades, d.descripcion, d.deposito, d.contratoMinimo, d.disponibleDesde,
      d.latitud, d.longitud, d.imagenPrincipal, d.galeria
    ]
  );

  const creado = await db.query(`${SELECT_INMUEBLE} WHERE i.id = $1`, [result.rows[0].id]);

  res.status(201).json({
    status: 'success',
    message: 'Inmueble publicado con éxito',
    data: creado.rows[0]
  });
}

module.exports = {
  getInmuebles,
  getInmueblePorId,
  getMisInmuebles,
  crearInmueble
};
