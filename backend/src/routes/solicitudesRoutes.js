const express = require('express');
const router = express.Router();
const solicitudesController = require('../controllers/solicitudesController');
const { requireAuth, requireRol } = require('../middleware/auth');

// Solicitudes de arriendo: estudiante y propietario nunca se comunican directo,
// todo pasa por el equipo de Roumix (ver solicitudesController).
router.use(requireAuth);

// POST /api/solicitudes - Enviar una solicitud de arriendo (estudiantes)
router.post('/', requireRol('estudiante'), solicitudesController.crearSolicitud);

// GET /api/solicitudes/mias - Mis solicitudes (estudiante) o las compartidas conmigo (propietario)
router.get('/mias', requireRol('estudiante', 'propietario'), solicitudesController.misSolicitudes);

// POST /api/solicitudes/:id/cancelar - El estudiante cancela su solicitud abierta
router.post('/:id/cancelar', requireRol('estudiante'), solicitudesController.cancelarSolicitud);

module.exports = router;
