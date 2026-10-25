const express = require('express');
const router = express.Router();
const inmueblesController = require('../controllers/inmueblesController');
const { requireAuth, requireRol } = require('../middleware/auth');
const subidaFotos = require('../middleware/subidaFotos');

const soloPropietario = [requireAuth, requireRol('propietario')];

// GET /api/inmuebles - Listar inmuebles disponibles con filtros (público)
router.get('/', inmueblesController.getInmuebles);

// GET /api/inmuebles/mios - Inmuebles del propietario autenticado (todos sus estados)
router.get('/mios', soloPropietario, inmueblesController.getMisInmuebles);

// GET /api/inmuebles/mios/:id - Un inmueble propio, en cualquier estado (para editar)
router.get('/mios/:id', soloPropietario, inmueblesController.getMiInmueble);

// GET /api/inmuebles/:id - Obtener un inmueble disponible por su ID (público)
router.get('/:id', inmueblesController.getInmueblePorId);

// POST /api/inmuebles - Publicar un inmueble con fotos (solo propietarios)
router.post('/', soloPropietario, subidaFotos, inmueblesController.crearInmueble);

// PUT /api/inmuebles/:id - Editar un inmueble propio y sus fotos
router.put('/:id', soloPropietario, subidaFotos, inmueblesController.actualizarInmueble);

// PATCH /api/inmuebles/:id/estado - Pausar, reactivar o marcar como arrendado
router.patch('/:id/estado', soloPropietario, inmueblesController.cambiarEstado);

// DELETE /api/inmuebles/:id - Eliminar un inmueble propio y sus fotos
router.delete('/:id', soloPropietario, inmueblesController.eliminarInmueble);

module.exports = router;
