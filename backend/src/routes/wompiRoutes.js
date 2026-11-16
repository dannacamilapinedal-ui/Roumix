const express = require('express');
const router = express.Router();
const wompiController = require('../controllers/wompiController');

// POST /api/wompi/eventos - Webhook de Wompi (sin sesión).
// Cada evento se acepta SOLO si su firma (checksum con el secreto de eventos) es válida.
// Esta es la URL que se configura en el panel de Wompi: https://<dominio>/api/wompi/eventos
router.post('/eventos', wompiController.recibirEvento);

module.exports = router;
