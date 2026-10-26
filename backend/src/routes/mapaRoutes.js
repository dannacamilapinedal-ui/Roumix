const express = require('express');
const router = express.Router();
const { obtenerTesela } = require('../services/teselasService');

// GET /api/mapa/teselas/:z/:x/:y.png - Tesela de OpenStreetMap (con caché) para los mapas de Roumix
router.get('/teselas/:z/:x/:y.png', async (req, res) => {
  const [z, x, y] = [req.params.z, req.params.x, req.params.y].map(Number);
  const datos = await obtenerTesela(z, x, y);
  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=604800' // el navegador la reutiliza 7 días
  });
  res.send(datos);
});

module.exports = router;
