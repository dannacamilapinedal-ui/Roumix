const express = require('express');
const router = express.Router();
const propietarioController = require('../controllers/propietarioController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Todo lo de este espacio es solo para propietarios con sesión
router.use(requireAuth, requireRol('propietario'));

// GET /api/propietario/verificacion - Estado de la verificación y datos del perfil
router.get('/verificacion', propietarioController.obtenerVerificacion);

// PUT /api/propietario/verificacion - Enviar o reenviar el perfil para revisión
router.put('/verificacion', propietarioController.enviarPerfil);

// POST /api/propietario/condiciones - Aceptar las condiciones de la comisión (sin reenviar el perfil)
router.post('/condiciones', propietarioController.aceptarCondiciones);

module.exports = router;
