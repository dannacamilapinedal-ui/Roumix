const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { supabase } = require('../config/supabase');

/**
 * GET /api/health
 * Comprobación de salud del servidor (Liveness probe)
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Servidor Roumix API funcionando correctamente 🚀',
    entorno: process.env.NODE_ENV || 'development',
    autenticacion: supabase ? 'configurada' : 'pendiente',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/health/db
 * Comprueba la conexión real con PostgreSQL en Supabase
 */
router.get('/db', async (req, res) => {
  try {
    const latenciaMs = await db.verificarConexion();
    res.status(200).json({ status: 'ok', baseDeDatos: 'conectada', latenciaMs });
  } catch (error) {
    console.error('❌ Health DB:', error.message);
    res.status(503).json({ status: 'error', baseDeDatos: 'sin conexión' });
  }
});

module.exports = router;
