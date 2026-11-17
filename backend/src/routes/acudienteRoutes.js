const express = require('express');
const router = express.Router();
const acudienteController = require('../controllers/acudienteController');

// "Paga mi acudiente": rutas PÚBLICAS (sin cuenta). El código del enlace es la autorización:
// solo sirve para pagar ese pago, por ese monto, antes de que venza (24 h).
router.get('/:codigo', acudienteController.verEnlace);
router.post('/:codigo/wompi', acudienteController.iniciarEnlace);
router.post('/:codigo/confirmar', acudienteController.confirmarEnlace);

module.exports = router;
