const db = require('../config/db');
const { crearClienteSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } = require('../config/supabase');

const ROLES = ['estudiante', 'propietario'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function errorHttp(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Normaliza un celular colombiano al formato de WhatsApp (57XXXXXXXXXX).
 * Devuelve null si viene vacío y lanza 400 si no es válido.
 */
function normalizarTelefono(valor) {
  const digitos = texto(valor).replace(/\D/g, '');
  if (!digitos) return null;
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (/^\d{10,15}$/.test(digitos)) return digitos;
  throw errorHttp(400, 'El teléfono debe ser un celular válido, por ejemplo 3101234567.');
}

// Error de configuración del servidor: la clave de Supabase no es válida
function verificarClave(error) {
  if (error && /invalid api key/i.test(error.message)) {
    console.error('❌ SUPABASE_ANON_KEY no es válida. Revise backend/.env');
    throw errorHttp(503, 'El servidor de autenticación no está bien configurado. Inténtalo más tarde.');
  }
}

async function obtenerPerfil(id) {
  const result = await db.query(
    'SELECT id, nombre, email, rol, telefono, universidad FROM usuarios WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

// Solo se envían al navegador los datos necesarios de la sesión
function datosSesion(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at
  };
}

/**
 * POST /api/auth/registro
 * Crea la cuenta en Supabase Auth. El perfil en usuarios lo crea el trigger
 * on_auth_user_created con los datos enviados en options.data.
 */
async function registro(req, res) {
  const body = req.body || {};
  const nombre = texto(body.nombre);
  const email = texto(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const rol = texto(body.rol);

  if (nombre.length < 2 || nombre.length > 120) throw errorHttp(400, 'Escribe tu nombre completo (entre 2 y 120 caracteres).');
  if (!EMAIL_REGEX.test(email) || email.length > 150) throw errorHttp(400, 'Escribe un correo electrónico válido.');
  if (password.length < 8 || password.length > 72) throw errorHttp(400, 'La contraseña debe tener entre 8 y 72 caracteres.');
  if (!ROLES.includes(rol)) throw errorHttp(400, 'Elige si te registras como estudiante o propietario.');

  const telefono = normalizarTelefono(body.telefono);
  if (rol === 'propietario' && !telefono) {
    throw errorHttp(400, 'Como propietario necesitas un celular para que los estudiantes te contacten por WhatsApp.');
  }

  const { data, error } = await crearClienteSupabase().auth.signUp({
    email,
    password,
    options: { data: { nombre, rol, telefono, universidad: texto(body.universidad) || null } }
  });

  verificarClave(error);
  if (error) {
    if (error.code === 'user_already_exists' || /already registered/i.test(error.message)) {
      throw errorHttp(409, 'Ya existe una cuenta con ese correo. Inicia sesión.');
    }
    if (error.status === 429) throw errorHttp(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
    if (error.code === 'weak_password') throw errorHttp(400, 'La contraseña es demasiado débil. Usa letras y números.');
    throw errorHttp(error.status && error.status < 500 ? error.status : 502, `No se pudo crear la cuenta: ${error.message}`);
  }

  // Con confirmación de correo activa, Supabase no revela si el correo ya existía:
  // devuelve un usuario sin identidades.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw errorHttp(409, 'Ya existe una cuenta con ese correo. Inicia sesión.');
  }

  if (!data.session) {
    return res.status(201).json({
      status: 'success',
      requiereConfirmacion: true,
      message: 'Cuenta creada. Revisa tu correo y abre el enlace de confirmación antes de iniciar sesión.'
    });
  }

  const perfil = await obtenerPerfil(data.user.id);
  res.status(201).json({
    status: 'success',
    requiereConfirmacion: false,
    message: 'Cuenta creada con éxito.',
    sesion: datosSesion(data.session),
    usuario: perfil
  });
}

/**
 * POST /api/auth/login
 * Valida correo y contraseña con Supabase Auth. El rol sale del perfil guardado.
 */
async function login(req, res) {
  const body = req.body || {};
  const email = texto(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) throw errorHttp(400, 'Escribe tu correo y tu contraseña.');

  const { data, error } = await crearClienteSupabase().auth.signInWithPassword({ email, password });

  verificarClave(error);
  if (error) {
    if (error.code === 'email_not_confirmed') {
      throw errorHttp(403, 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.');
    }
    if (error.status === 429) throw errorHttp(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
    if (error.status === 400 || error.code === 'invalid_credentials') throw errorHttp(401, 'Correo o contraseña incorrectos.');
    throw errorHttp(502, `No se pudo iniciar sesión: ${error.message}`);
  }

  const perfil = await obtenerPerfil(data.user.id);
  if (!perfil) throw errorHttp(403, 'La cuenta no tiene un perfil en Roumix.');

  res.status(200).json({
    status: 'success',
    sesion: datosSesion(data.session),
    usuario: perfil
  });
}

/**
 * POST /api/auth/refresh
 * Renueva el token de acceso con el refresh token.
 */
async function refresh(req, res) {
  const refreshToken = texto((req.body || {}).refresh_token);
  if (!refreshToken) throw errorHttp(400, 'Falta el refresh_token.');

  const { data, error } = await crearClienteSupabase().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw errorHttp(401, 'La sesión expiró. Inicia sesión de nuevo.');

  const perfil = await obtenerPerfil(data.user.id);
  if (!perfil) throw errorHttp(403, 'La cuenta no tiene un perfil en Roumix.');

  res.status(200).json({
    status: 'success',
    sesion: datosSesion(data.session),
    usuario: perfil
  });
}

/**
 * GET /api/auth/perfil  (requireAuth)
 * Perfil del usuario con sesión, leído de la base de datos.
 */
async function perfil(req, res) {
  res.status(200).json({ status: 'success', usuario: req.usuario });
}

/**
 * POST /api/auth/logout  (requireAuth)
 * Cierra la sesión en Supabase Auth (invalida su refresh token).
 */
async function logout(req, res) {
  const token = req.headers.authorization.split(' ')[1];
  const respuesta = await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });

  if (!respuesta.ok && respuesta.status !== 401) {
    throw errorHttp(502, 'No se pudo cerrar la sesión en el servidor de autenticación.');
  }
  res.status(200).json({ status: 'success', message: 'Sesión cerrada.' });
}

module.exports = { registro, login, refresh, perfil, logout };
