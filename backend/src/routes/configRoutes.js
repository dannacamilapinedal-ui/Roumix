const express = require('express');
const router = express.Router();
const { captchaActivo, SITE_KEY } = require('../services/captchaService');

// GET /api/config - Configuración pública del frontend (solo datos que pueden ser públicos)
router.get('/', (req, res) => {
  res.json({
    status: 'success',
    data: {
      // La clave de sitio de Turnstile es pública por diseño; la secreta nunca sale del servidor
      turnstileSiteKey: captchaActivo ? SITE_KEY : null
    }
  });
});

module.exports = router;
