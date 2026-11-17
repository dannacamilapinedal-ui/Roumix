const express = require('express');
const router = express.Router();
const identidadController = require('../controllers/identidadController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Documento de identidad del usuario (lo pide el contrato de arrendamiento)
router.use(requireAuth);
router.get('/', requireRol('estudiante', 'propietario'), identidadController.ver);
router.put('/', requireRol('estudiante', 'propietario'), identidadController.guardar);

module.exports = router;
