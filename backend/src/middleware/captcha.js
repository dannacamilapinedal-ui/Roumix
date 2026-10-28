const { captchaActivo, verificarToken } = require('../services/captchaService');

/**
 * Exige un CAPTCHA válido en req.body.captchaToken (cuando el CAPTCHA está configurado).
 * Se usa en registro, inicio de sesión y recuperación de contraseña.
 */
async function requireCaptcha(req, res, next) {
  if (!captchaActivo) return next();

  const token = typeof (req.body || {}).captchaToken === 'string' ? req.body.captchaToken.trim() : '';
  if (!token || token.length > 2048) {
    return res.status(400).json({ status: 'error', codigo: 'captcha', message: 'Completa la verificación de seguridad.' });
  }

  try {
    const valido = await verificarToken(token, req.ip);
    if (!valido) {
      return res.status(400).json({
        status: 'error',
        codigo: 'captcha',
        message: 'La verificación de seguridad no es válida o expiró. Inténtalo de nuevo.'
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireCaptcha;
