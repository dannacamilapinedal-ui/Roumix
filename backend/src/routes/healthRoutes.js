const express = require('express');
const router = express.Router();

/**
 * GET /api/health
 * Comprobación de salud del servidor (Liveness probe)
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Servidor Roumix API funcionando correctamente 🚀',
    entorno: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
