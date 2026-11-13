const express = require('express');
const router = express.Router();
const contratosController = require('../controllers/contratosController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Contratos (flujo demostrativo): solo las partes del contrato y la administración
router.use(requireAuth);

// GET /api/contratos/mios - Contratos en los que participo (ya enviados por Roumix)
router.get('/mios', requireRol('estudiante', 'propietario'), contratosController.misContratos);

// GET /api/contratos/:id - Ver un contrato (partes y administración)
router.get('/:id', requireRol('estudiante', 'propietario', 'admin'), contratosController.verContrato);

// POST /api/contratos/:id/aceptar - Aceptación demostrativa de una de las partes
router.post('/:id/aceptar', requireRol('estudiante', 'propietario'), contratosController.aceptarContrato);

module.exports = router;
