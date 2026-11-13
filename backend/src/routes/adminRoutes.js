const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const solicitudesController = require('../controllers/solicitudesController');
const mensajesController = require('../controllers/mensajesController');
const contratosController = require('../controllers/contratosController');
const pagosController = require('../controllers/pagosController');
const { requireAuth, requireRol } = require('../middleware/auth');
const auditoriaAdmin = require('../middleware/auditoriaAdmin');
const { auditar } = require('../services/auditoriaService');

// Todas las rutas exigen sesión válida y rol admin leído de la base de datos.
// Ocultar el menú en el navegador no basta: aquí se rechaza cualquier otra cuenta.
// Un intento de usar el panel con una cuenta que no es admin queda en la auditoría
async function registrarAccesoDenegado(req, res, next) {
  if (req.usuario && req.usuario.rol !== 'admin') {
    await auditar({
      actor: req.usuario, accion: 'acceso_denegado_panel', entidad: 'panel',
      resumen: `${req.method} ${req.baseUrl}${req.path}`.slice(0, 200), ip: req.ip
    });
  }
  next();
}

router.use(requireAuth, registrarAccesoDenegado, requireRol('admin'));

// Toda acción que cambia datos queda en la auditoría (antes de responder)
router.use(auditoriaAdmin);

router.get('/resumen', adminController.resumen);
router.get('/reportes', adminController.listarReportes);
router.get('/inmuebles', adminController.listarInmuebles);
router.get('/inmuebles/:id', adminController.detalleInmueble);
router.post('/inmuebles/:id/moderacion', adminController.moderarInmueble);
router.get('/usuarios', adminController.listarUsuarios);
router.post('/usuarios/:id/estado', adminController.cambiarEstadoUsuario);
router.get('/historial', adminController.historial);
router.get('/auditoria', adminController.auditoria);
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
router.get('/contratos', contratosController.listarAdmin);
router.get('/solicitudes/:id/contratos', contratosController.contratosDeSolicitud);
router.post('/solicitudes/:id/contrato', contratosController.crearBorrador);
router.put('/contratos/:id', contratosController.editarBorrador);
router.post('/contratos/:id/enviar', contratosController.enviarContrato);
router.post('/contratos/:id/cancelar', contratosController.cancelarContrato);
router.get('/pagos', pagosController.listarAdmin);
router.get('/pagos/:id', pagosController.detalleAdmin);
router.post('/solicitudes/:id/pago', pagosController.habilitarAdmin);
router.post('/pagos/:id/desembolso', pagosController.registrarDesembolso);
router.post('/pagos/:id/devolucion', pagosController.registrarDevolucion);
router.post('/pagos/:id/resolver-disputa', pagosController.resolverDisputa);
router.post('/pagos/:id/cancelar', pagosController.cancelarAdmin);

module.exports = router;
