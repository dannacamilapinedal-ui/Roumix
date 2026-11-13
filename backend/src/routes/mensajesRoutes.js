const express = require('express');
const router = express.Router();
const mensajesController = require('../controllers/mensajesController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Comunicación gestionada: cada usuario conversa solo con el equipo de Roumix.
// No hay ninguna ruta para escribirle a otro usuario.
router.use(requireAuth, requireRol('estudiante', 'propietario'));

// GET /api/conversaciones - Mis conversaciones con Roumix
router.get('/', mensajesController.misConversaciones);

// POST /api/conversaciones - Nueva consulta a Roumix (opcionalmente sobre una vivienda o solicitud)
router.post('/', mensajesController.crearConversacion);

// GET /api/conversaciones/:id - Mensajes de una conversación (sin notas internas)
router.get('/:id', mensajesController.verConversacion);

// POST /api/conversaciones/:id/mensajes - Escribir en una conversación propia
router.post('/:id/mensajes', mensajesController.enviarMensaje);

module.exports = router;
