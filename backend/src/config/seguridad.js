/**
 * Políticas de seguridad del navegador (CORS y cabeceras HTTP).
 *
 * La política de contenido (CSP) dice desde qué sitios puede cargar la página scripts,
 * estilos, imágenes, etc. Si alguien lograra inyectar HTML, el navegador no ejecutaría
 * código de otros dominios ni enviaría datos a ellos. Se permite 'unsafe-inline' porque
 * las páginas tienen scripts y estilos en línea; aun así se bloquean dominios ajenos,
 * plugins, el cambio de <base> y que otro sitio meta a Roumix en un iframe.
 *
 * vercel.json repite estas cabeceras para los archivos estáticos que sirve Vercel.
 */
const limpiar = (v) => String(v || '').trim().replace(/\/+$/, '');

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://unpkg.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co https://unpkg.com",
  "connect-src 'self' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const CABECERAS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

function cabecerasSeguridad(req, res, next) {
  Object.entries(CABECERAS).forEach(([nombre, valor]) => res.setHeader(nombre, valor));
  next();
}

/**
 * Orígenes que pueden llamar a la API desde otro dominio.
 * - CORS_ORIGIN (separados por coma) si está configurado.
 * - Si no: la dirección pública (APP_URL) y los dominios conocidos de Roumix.
 * - En desarrollo, además, cualquier localhost / 127.0.0.1 (Live Server, etc.).
 * Las peticiones sin cabecera Origin (mismo sitio, curl, el cron de Vercel) siempre pasan.
 */
const ORIGENES_CONOCIDOS = ['https://roumix-eight.vercel.app', 'https://roumix.onrender.com'];

function origenesPermitidos() {
  const configurados = String(process.env.CORS_ORIGIN || '').split(',').map(limpiar).filter(Boolean);
  if (configurados.length) return configurados;
  return [...new Set([limpiar(process.env.APP_URL), ...ORIGENES_CONOCIDOS].filter(Boolean))];
}

const enProduccion = () => process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const esLocal = (origen) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origen);

function opcionesCors() {
  const permitidos = origenesPermitidos();
  return {
    origin(origen, callback) {
      if (!origen) return callback(null, true);
      const ok = permitidos.includes(limpiar(origen)) || (!enProduccion() && esLocal(origen));
      // Un origen no permitido no recibe la cabecera CORS: el navegador bloquea la respuesta
      callback(null, ok);
    }
  };
}

module.exports = { cabecerasSeguridad, opcionesCors, CSP, CABECERAS };
