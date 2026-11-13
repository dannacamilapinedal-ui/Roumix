const express = require('express');
const router = express.Router();
const pagosController = require('../controllers/pagosController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Pagos SIMULADOS: no se mueve dinero real ni se guardan datos de tarjetas.
router.use(requireAuth);

// GET /api/pagos/mios - Pagos del estudiante o del propietario
router.get('/mios', requireRol('estudiante', 'propietario'), pagosController.misPagos);

// GET /api/pagos/:id - Detalle de un pago (partes y administración)
router.get('/:id', requireRol('estudiante', 'propietario', 'admin'), pagosController.verPago);

// POST /api/pagos/:id/simular - El estudiante paga el primer canon con el simulador
router.post('/:id/simular', requireRol('estudiante'), pagosController.simularPago);

// POST /api/pagos/:id/disputa - El estudiante reporta un problema con un pago aprobado
router.post('/:id/disputa', requireRol('estudiante'), pagosController.abrirDisputa);

module.exports = router;
