const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const solicitudesController = require('../controllers/solicitudesController');
const mensajesController = require('../controllers/mensajesController');
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
router.get('/propietarios', adminController.listarPropietarios);
router.post('/propietarios/:id/verificacion', adminController.decidirVerificacion);
router.get('/solicitudes', solicitudesController.listarAdmin);
router.get('/solicitudes/:id', solicitudesController.detalleAdmin);
router.post('/solicitudes/:id', solicitudesController.actualizarAdmin);
router.get('/conversaciones', mensajesController.listarAdmin);
router.post('/conversaciones', mensajesController.iniciarAdmin);
router.get('/conversaciones/:id', mensajesController.detalleAdmin);
router.post('/conversaciones/:id/mensajes', mensajesController.responderAdmin);
router.post('/conversaciones/:id/estado', mensajesController.cambiarEstadoAdmin);

module.exports = router;
