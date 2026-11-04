/**
 * Punto de entrada de Roumix en Vercel.
 * Toda la API (/api/*) corre en esta única función, que reutiliza la aplicación Express
 * del backend. Las páginas (frontend/) las entrega directamente la red de Vercel.
 * En local y en Render se sigue usando backend/src/server.js.
 */
module.exports = require('../backend/src/app');
