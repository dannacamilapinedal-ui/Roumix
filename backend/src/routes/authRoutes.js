const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth, requireAuthConfigurada } = require('../middleware/auth');
const requireCaptcha = require('../middleware/captcha');

router.use(requireAuthConfigurada);

// POST /api/auth/registro - Crear cuenta (estudiante o propietario)
router.post('/registro', requireCaptcha, authController.registro);

// POST /api/auth/login - Iniciar sesión con correo y contraseña
router.post('/login', requireCaptcha, authController.login);

// POST /api/auth/recuperar - Enviar el correo para crear una contraseña nueva
router.post('/recuperar', requireCaptcha, authController.recuperar);

// POST /api/auth/restablecer - Guardar la contraseña nueva (token del enlace del correo)
router.post('/restablecer', requireAuth, authController.restablecer);

// POST /api/auth/refresh - Renovar el token de acceso
router.post('/refresh', authController.refresh);

// GET /api/auth/perfil - Perfil del usuario con sesión
router.get('/perfil', requireAuth, authController.perfil);

// POST /api/auth/logout - Cerrar sesión
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
