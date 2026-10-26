const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Todas las rutas exigen sesión válida y rol admin leído de la base de datos.
// Ocultar el menú en el navegador no basta: aquí se rechaza cualquier otra cuenta.
router.use(requireAuth, requireRol('admin'));

router.get('/resumen', adminController.resumen);
router.get('/reportes', adminController.listarReportes);
router.get('/inmuebles', adminController.listarInmuebles);
router.get('/inmuebles/:id', adminController.detalleInmueble);
router.post('/inmuebles/:id/moderacion', adminController.moderarInmueble);
router.get('/usuarios', adminController.listarUsuarios);
router.post('/usuarios/:id/estado', adminController.cambiarEstadoUsuario);
router.get('/historial', adminController.historial);

module.exports = router;
