const express = require('express');
const router = express.Router();
const contratosController = require('../controllers/contratosController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Contratos con firma electrónica: solo las partes del contrato y la administración
router.use(requireAuth);

// GET /api/contratos/mios - Contratos en los que participo (ya enviados por Roumix)
router.get('/mios', requireRol('estudiante', 'propietario'), contratosController.misContratos);

// GET /api/contratos/:id - Ver un contrato (partes y administración)
router.get('/:id', requireRol('estudiante', 'propietario', 'admin'), contratosController.verContrato);

// GET /api/contratos/:id/pdf - El PDF del contrato (el firmado, si ya se formalizó)
router.get('/:id/pdf', requireRol('estudiante', 'propietario', 'admin'), contratosController.descargarPdf);

// POST /api/contratos/:id/codigo - Envía al correo el código de un solo uso para firmar
router.post('/:id/codigo', requireRol('estudiante', 'propietario'), contratosController.solicitarCodigo);

// POST /api/contratos/:id/aceptar - Firma de una de las partes (nombre, firma dibujada y código)
router.post('/:id/aceptar',requireRol('estudiante', 'propietario'), contratosController.aceptarContrato);

module.exports = router;
