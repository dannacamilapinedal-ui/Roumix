const express = require('express');
const router = express.Router();
const verificarController = require('../controllers/verificarController');

// Verificación PÚBLICA de contratos firmados (sin cuenta): solo iniciales, fechas y huellas
router.get('/huella/:sha256', verificarController.porHuella);
router.get('/:codigo', verificarController.porCodigo);

module.exports = router;
