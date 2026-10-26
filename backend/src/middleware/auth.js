const db = require('../config/db');
const { supabase } = require('../config/supabase');

/**
 * Responde 503 si faltan SUPABASE_URL / SUPABASE_ANON_KEY en el servidor.
 */
function requireAuthConfigurada(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'La autenticación no está configurada en el servidor (SUPABASE_URL / SUPABASE_ANON_KEY).'
    });
  }
  next();
}

/**
 * Exige un token de Supabase Auth válido en "Authorization: Bearer <token>".
 * Carga el perfil desde la tabla usuarios en req.usuario.
 * El rol SIEMPRE sale de la base de datos, nunca del navegador.
 */
async function requireAuth(req, res, next) {
  if (!supabase) return requireAuthConfigurada(req, res, next);

  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ status: 'error', message: 'Debe iniciar sesión.' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({ status: 'error', message: 'Sesión inválida o expirada.' });
    }

    const result = await db.query(
      'SELECT id, nombre, email, rol, estado, telefono, universidad FROM usuarios WHERE id = $1',
      [data.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ status: 'error', message: 'La cuenta no tiene un perfil en Roumix.' });
    }
    if (result.rows[0].estado !== 'activo') {
      return res.status(403).json({
        status: 'error',
        codigo: 'cuenta_suspendida',
        message: 'Tu cuenta está suspendida. Escribe a Roumix si crees que es un error.'
      });
    }

    req.usuario = { ...result.rows[0], correoConfirmado: Boolean(data.user.email_confirmed_at) };
    req.token = token; // para operar en Storage en nombre del usuario
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Exige que el usuario autenticado tenga uno de los roles indicados.
 * Debe usarse después de requireAuth.
 */
function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ status: 'error', message: 'No tiene permiso para realizar esta operación.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRol, requireAuthConfigurada };
