const express = require('express');
const router = express.Router();
const mensajesController = require('../controllers/mensajesController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/notificaciones - Últimas novedades y cuántas faltan por leer
router.get('/', mensajesController.misAvisos);

// POST /api/notificaciones/leidas - Marcar novedades como leídas ({ ids } o todas)
router.post('/leidas', mensajesController.marcarAvisosLeidos);

module.exports = router;
