const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth, requireAuthConfigurada } = require('../middleware/auth');

router.use(requireAuthConfigurada);

// POST /api/auth/registro - Crear cuenta (estudiante o propietario)
router.post('/registro', authController.registro);

// POST /api/auth/login - Iniciar sesión con correo y contraseña
router.post('/login', authController.login);

// POST /api/auth/refresh - Renovar el token de acceso
router.post('/refresh', authController.refresh);

// GET /api/auth/perfil - Perfil del usuario con sesión
router.get('/perfil', requireAuth, authController.perfil);

// POST /api/auth/logout - Cerrar sesión
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
