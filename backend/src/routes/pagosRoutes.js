const express = require('express');
const router = express.Router();
const pagosController = require('../controllers/pagosController');
const wompiController = require('../controllers/wompiController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Pagos del primer canon: con Wompi si está configurado; si no, con el simulador.
// Roumix nunca recibe ni guarda datos de tarjetas o cuentas.
router.use(requireAuth);

// GET /api/pagos/mios - Pagos del estudiante o del propietario
router.get('/mios', requireRol('estudiante', 'propietario'), pagosController.misPagos);

// GET /api/pagos/:id - Detalle de un pago (partes y administración)
router.get('/:id', requireRol('estudiante', 'propietario', 'admin'), pagosController.verPago);

// POST /api/pagos/:id/simular - El estudiante paga el primer canon con el simulador
router.post('/:id/simular', requireRol('estudiante'), pagosController.simularPago);

// POST /api/pagos/:id/wompi - El estudiante abre la pasarela de Wompi (referencia + firma del monto)
router.post('/:id/wompi', requireRol('estudiante'), wompiController.iniciar);

// POST /api/pagos/:id/wompi/confirmar - Roumix consulta a Wompi el resultado de la transacción
router.post('/:id/wompi/confirmar', requireRol('estudiante'), wompiController.confirmar);

// POST /api/pagos/:id/disputa - El estudiante reporta un problema con un pago aprobado
router.post('/:id/disputa', requireRol('estudiante'), pagosController.abrirDisputa);

module.exports = router;
