const express = require('express');
const router = express.Router();
const { limpiarCuentasSinConfirmar } = require('../services/limpiezaService');

/**
 * GET /api/tareas/limpieza - Tarea programada (Vercel Cron Jobs, una vez al día).
 * Vercel envía "Authorization: Bearer <CRON_SECRET>"; sin ese secreto nadie puede ejecutarla.
 * En local y en Render la misma limpieza corre cada hora desde server.js.
 */
router.get('/limpieza', async (req, res) => {
  const secreto = String(process.env.CRON_SECRET || '').trim();
  if (!secreto) {
    return res.status(503).json({ status: 'error', message: 'CRON_SECRET no está configurado.' });
  }
  if (req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ status: 'error', message: 'No autorizado.' });
  }
  const eliminadas = await limpiarCuentasSinConfirmar();
  res.json({ status: 'success', eliminadas });
});

module.exports = router;
