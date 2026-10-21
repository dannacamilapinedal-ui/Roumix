const db = require('../config/db');

/**
 * GET /api/inmuebles
 * Obtiene la lista de inmuebles con filtros opcionales
 */
async function getInmuebles(req, res) {
  try {
    const { tipo, precioMax, universidad, q } = req.query;

    let queryText = 'SELECT * FROM inmuebles WHERE estado = $1';
    const queryParams = ['disponible'];
    let paramIndex = 2;

    if (tipo && tipo !== 'todos') {
      queryText += ` AND tipo = $${paramIndex}`;
      queryParams.push(tipo);
      paramIndex++;
    }

    if (precioMax) {
      queryText += ` AND precio <= $${paramIndex}`;
      queryParams.push(Number(precioMax));
      paramIndex++;
    }

    if (universidad && universidad !== 'todas') {
      queryText += ` AND LOWER(universidad) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${universidad}%`);
      paramIndex++;
    }

    if (q) {
      queryText += ` AND (LOWER(titulo) LIKE LOWER($${paramIndex}) OR LOWER(barrio) LIKE LOWER($${paramIndex}))`;
      queryParams.push(`%${q}%`);
      paramIndex++;
    }

    queryText += ' ORDER BY id ASC';

    const result = await db.query(queryText, queryParams);

    res.status(200).json({
      status: 'success',
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    console.error('Error al consultar inmuebles:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al consultar inmuebles en la base de datos',
      error: error.message
    });
  }
}

/**
 * GET /api/inmuebles/:id
 * Obtiene el detalle de un inmueble por su ID
 */
async function getInmueblePorId(req, res) {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM inmuebles WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: `Inmueble con ID ${id} no encontrado`
      });
    }

    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al consultar inmueble por ID:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al consultar el inmueble',
      error: error.message
    });
  }
}

/**
 * POST /api/inmuebles
 * Crea un nuevo inmueble en la base de datos
 */
async function crearInmueble(req, res) {
  try {
    const {
      titulo, tipo, tipoLabel, precio, barrio, universidad,
      distanciaTexto, distanciaMetros, tiempoPie, estrato, area,
      transporte, amenidades, descripcion, deposito, contratoMinimo,
      latitud, longitud, imagenPrincipal, galeria, propietarioNombre, propietarioTelefono
    } = req.body;

    if (!titulo || !tipo || !precio || !barrio) {
      return res.status(400).json({
        status: 'error',
        message: 'Los campos titulo, tipo, precio y barrio son obligatorios'
      });
    }

    const queryText = `
      INSERT INTO inmuebles (
        titulo, tipo, tipo_label, precio, barrio, universidad,
        distancia_texto, distancia_metros, tiempo_pie, estrato, area,
        transporte, amenidades, descripcion, deposito, contrato_minimo,
        latitud, longitud, imagen_principal, galeria, estado,
        propietario_nombre, propietario_telefono
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, 'disponible',
        $21, $22
      ) RETURNING *;
    `;

    const values = [
      titulo, tipo, tipoLabel || tipo, Number(precio), barrio, universidad || 'Santo Tomás',
      distanciaTexto || `${barrio} · Villavicencio`, distanciaMetros || 1000, tiempoPie || '10 min',
      estrato || 3, area || '15 m²', transporte || 'Ruta cercana', amenidades || [],
      descripcion || '', deposito || `$${Number(precio).toLocaleString('es-CO')}`,
      contratoMinimo || '6 meses', latitud || 4.1500, longitud || -73.6350,
      imagenPrincipal || 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80',
      galeria || [], propietarioNombre || 'Propietario Roumix', propietarioTelefono || '573100000000'
    ];

    const result = await db.query(queryText, values);

    res.status(201).json({
      status: 'success',
      message: 'Inmueble publicado con éxito en la base de datos 🎉',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear inmueble:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al registrar el inmueble en PostgreSQL',
      error: error.message
    });
  }
}

module.exports = {
  getInmuebles,
  getInmueblePorId,
  crearInmueble
};
