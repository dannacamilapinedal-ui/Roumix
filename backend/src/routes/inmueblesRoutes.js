const express = require('express');
const router = express.Router();
const inmueblesController = require('../controllers/inmueblesController');
const { requireAuth, requireRol } = require('../middleware/auth');

// GET /api/inmuebles - Listar inmuebles disponibles con filtros (público)
router.get('/', inmueblesController.getInmuebles);

// GET /api/inmuebles/mios - Inmuebles del propietario autenticado (todos sus estados)
router.get('/mios', requireAuth, requireRol('propietario'), inmueblesController.getMisInmuebles);

// GET /api/inmuebles/:id - Obtener un inmueble disponible por su ID (público)
router.get('/:id', inmueblesController.getInmueblePorId);

// POST /api/inmuebles - Publicar un nuevo inmueble (solo propietarios autenticados)
router.post('/', requireAuth, requireRol('propietario'), inmueblesController.crearInmueble);

module.exports = router;
