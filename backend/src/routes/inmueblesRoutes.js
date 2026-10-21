const express = require('express');
const router = express.Router();
const inmueblesController = require('../controllers/inmueblesController');

// GET /api/inmuebles - Listar todos los inmuebles con filtros
router.get('/', inmueblesController.getInmuebles);

// GET /api/inmuebles/:id - Obtener un inmueble por su ID
router.get('/:id', inmueblesController.getInmueblePorId);

// POST /api/inmuebles - Publicar un nuevo inmueble
router.post('/', inmueblesController.crearInmueble);

module.exports = router;
