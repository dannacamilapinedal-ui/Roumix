const db = require('../config/db');
const fotos = require('../services/fotosService');

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

/**
 * Valida y normaliza los datos de un inmueble recibidos del formulario.
 * Los datos del propietario NO se leen del cuerpo: salen de la sesión.
 * Las fotos tampoco: solo se aceptan las que el servidor sube a Storage.
 */
function validarInmueble(body) {
  const tipo = textoObligatorio(body.tipo, 'tipo', 30);
  if (!TIPOS.includes(tipo)) throw errorValidacion(`tipo debe ser uno de: ${TIPOS.join(', ')}.`);

  const precio = enteroOpcional(body.precio, 'precio', 1, 100000000);
  if (precio === null) throw errorValidacion('precio es obligatorio.');


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
    longitud: numeroOpcional(body.longitud, 'longitud', -180, 180)
  };
}

const ORDENES = {
  'precio-asc': 'i.precio ASC, i.id DESC',
  'precio-desc': 'i.precio DESC, i.id DESC',
  distancia: 'i.distancia_metros ASC NULLS LAST, i.precio ASC',
  recientes: 'i.created_at DESC, i.id DESC'
};
const MAX_COMPARAR = 3;

// Texto de búsqueda para ILIKE: % y _ del usuario se buscan literalmente
function patronBusqueda(valor) {
  return `%${String(valor).slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * GET /api/inmuebles?tipo=&precioMax=&universidad=&q=&orden=&ids=
 * Lista los inmuebles disponibles con filtros opcionales.
 * ids=1,2,3 devuelve solo esos (máx. 3, para el comparador); los que no existan
 * o no estén disponibles simplemente no aparecen.
 */
async function getInmuebles(req, res) {
  const { tipo, precioMax, universidad, q, orden, ids } = req.query;

  let queryText = `${SELECT_INMUEBLE} WHERE i.estado = $1`;
  const queryParams = ['disponible'];

  if (ids !== undefined) {
    const lista = String(ids).split(',').filter(Boolean).map((v) => enteroOpcional(v, 'ids', 1, 2147483647));
    if (lista.length === 0 || lista.length > MAX_COMPARAR) {
      throw errorValidacion(`ids debe tener entre 1 y ${MAX_COMPARAR} inmuebles.`);
    }
    queryParams.push(lista);
    queryText += ` AND i.id = ANY($${queryParams.length}::int[])`;
  }

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
    queryParams.push(patronBusqueda(universidad));
    queryText += ` AND i.universidad ILIKE $${queryParams.length}`;
  }

  if (q && String(q).trim()) {
    queryParams.push(patronBusqueda(String(q).trim()));
    const n = queryParams.length;
    queryText += ` AND (i.titulo ILIKE $${n} OR i.barrio ILIKE $${n} OR i.universidad ILIKE $${n}
                   OR i.distancia_texto ILIKE $${n} OR array_to_string(i.amenidades, ' ') ILIKE $${n})`;
  }

  if (orden !== undefined && !ORDENES[orden]) {
    throw errorValidacion(`orden debe ser uno de: ${Object.keys(ORDENES).join(', ')}.`);
  }
  queryText += ` ORDER BY ${ORDENES[orden] || ORDENES.recientes}`;

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


const ESTADOS = ['disponible', 'pausado', 'arrendado'];

function idDeRuta(req) {
  const id = enteroOpcional(req.params.id, 'id', 1, 2147483647);
  if (id === null) throw errorValidacion('id no válido.');
  return id;
}

// Respuesta única para "no existe" y "no es tuyo": no revela inmuebles ajenos
function noEncontrado(res, id) {
  return res.status(404).json({ status: 'error', message: `No tienes un inmueble con ID ${id}.` });
}

/**
 * GET /api/inmuebles/mios/:id
 * Un inmueble propio en cualquier estado (para editarlo)
 */
async function getMiInmueble(req, res) {
  const id = idDeRuta(req);
  const result = await db.query(`${SELECT_INMUEBLE} WHERE i.id = $1 AND i.propietario_id = $2`, [id, req.usuario.id]);
  if (result.rows.length === 0) return noEncontrado(res, id);
  res.status(200).json({ status: 'success', data: result.rows[0] });
}

/**
 * POST /api/inmuebles  (multipart: "datos" JSON + "fotos")
 * Crea un inmueble del propietario autenticado con sus fotos en Supabase Storage
 */
async function crearInmueble(req, res) {
  const d = validarInmueble(req.body || {});
  if (req.files.length === 0) throw errorValidacion('Agrega al menos una foto del inmueble.');

  const urls = await fotos.subirFotos(req.token, req.usuario.id, req.files);

  let id;
  try {
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
        d.latitud, d.longitud, urls[0], urls
      ]
    );
    id = result.rows[0].id;
  } catch (error) {
    // Si no se guardó el inmueble, sus fotos no deben quedar huérfanas en Storage
    await fotos.borrarFotos(req.token, urls);
    throw error;
  }

  const creado = await db.query(`${SELECT_INMUEBLE} WHERE i.id = $1`, [id]);
  res.status(201).json({
    status: 'success',
    message: 'Inmueble publicado con éxito',
    data: creado.rows[0]
  });
}

/**
 * PUT /api/inmuebles/:id  (multipart: "datos" JSON + "fotos" nuevas)
 * Edita un inmueble propio. datos.fotosConservar = URLs actuales que se mantienen, en orden.
 */
async function actualizarInmueble(req, res) {
  const id = idDeRuta(req);
  const d = validarInmueble(req.body || {});

  const actual = await db.query('SELECT galeria FROM inmuebles WHERE id = $1 AND propietario_id = $2', [id, req.usuario.id]);
  if (actual.rows.length === 0) return noEncontrado(res, id);
  const galeriaActual = actual.rows[0].galeria;

  const conservar = Array.isArray(req.body.fotosConservar) ? req.body.fotosConservar : galeriaActual;
  if (conservar.some((url) => !galeriaActual.includes(url))) {
    throw errorValidacion('Solo puedes conservar fotos que ya pertenecen a este inmueble.');
  }
  const total = conservar.length + req.files.length;
  if (total === 0) throw errorValidacion('El inmueble debe tener al menos una foto.');
  if (total > fotos.MAX_FOTOS_POR_INMUEBLE) {
    throw errorValidacion(`Un inmueble puede tener máximo ${fotos.MAX_FOTOS_POR_INMUEBLE} fotos.`);
  }

  const nuevas = await fotos.subirFotos(req.token, req.usuario.id, req.files);
  const galeria = [...conservar, ...nuevas];

  try {
    const result = await db.query(
      `UPDATE inmuebles SET
         titulo = $3, tipo = $4, tipo_label = $5, precio = $6, barrio = $7, universidad = $8,
         distancia_texto = $9, distancia_metros = $10, tiempo_pie = $11, estrato = $12, area = $13,
         transporte = $14, amenidades = $15, descripcion = $16, deposito = $17, contrato_minimo = $18,
         disponible_desde = $19, latitud = $20, longitud = $21, imagen_principal = $22, galeria = $23
       WHERE id = $1 AND propietario_id = $2`,
      [
        id, req.usuario.id, d.titulo, d.tipo, d.tipoLabel, d.precio, d.barrio, d.universidad,
        d.distanciaTexto, d.distanciaMetros, d.tiempoPie, d.estrato, d.area,
        d.transporte, d.amenidades, d.descripcion, d.deposito, d.contratoMinimo,
        d.disponibleDesde, d.latitud, d.longitud, galeria[0], galeria
      ]
    );
    if (result.rowCount === 0) {
      await fotos.borrarFotos(req.token, nuevas);
      return noEncontrado(res, id);
    }
  } catch (error) {
    await fotos.borrarFotos(req.token, nuevas);
    throw error;
  }

  // Las fotos retiradas se borran de Storage solo después de guardar el cambio
  await fotos.borrarFotos(req.token, galeriaActual.filter((url) => !conservar.includes(url)));

  const editado = await db.query(`${SELECT_INMUEBLE} WHERE i.id = $1`, [id]);
  res.status(200).json({ status: 'success', message: 'Inmueble actualizado', data: editado.rows[0] });
}

/**
 * PATCH /api/inmuebles/:id/estado  { estado: disponible | pausado | arrendado }
 */
async function cambiarEstado(req, res) {
  const id = idDeRuta(req);
  const estado = (req.body || {}).estado;
  if (!ESTADOS.includes(estado)) throw errorValidacion(`estado debe ser uno de: ${ESTADOS.join(', ')}.`);

  const result = await db.query(
    'UPDATE inmuebles SET estado = $3 WHERE id = $1 AND propietario_id = $2 RETURNING id, estado',
    [id, req.usuario.id, estado]
  );
  if (result.rowCount === 0) return noEncontrado(res, id);
  res.status(200).json({ status: 'success', data: result.rows[0] });
}

/**
 * DELETE /api/inmuebles/:id
 * Elimina un inmueble propio y sus fotos
 */
async function eliminarInmueble(req, res) {
  const id = idDeRuta(req);
  const result = await db.query(
    'DELETE FROM inmuebles WHERE id = $1 AND propietario_id = $2 RETURNING galeria',
    [id, req.usuario.id]
  );
  if (result.rowCount === 0) return noEncontrado(res, id);

  await fotos.borrarFotos(req.token, result.rows[0].galeria);
  res.status(200).json({ status: 'success', message: 'Inmueble eliminado' });
}

module.exports = {
  getInmuebles,
  getInmueblePorId,
  getMisInmuebles,
  getMiInmueble,
  crearInmueble,
  actualizarInmueble,
  cambiarEstado,
  eliminarInmueble
};
