const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');

// Rutas
const healthRoutes = require('./routes/healthRoutes');
const inmueblesRoutes = require('./routes/inmueblesRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const mapaRoutes = require('./routes/mapaRoutes');
const configRoutes = require('./routes/configRoutes');
const tareasRoutes = require('./routes/tareasRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Detrás del proxy de Render: req.ip y req.protocol (https) salen de las cabeceras del proxy
app.set('trust proxy', 1);

// CORS: en producción solo los orígenes listados en CORS_ORIGIN (separados por coma).
// En desarrollo se permite cualquier origen (Live Server, archivos locales, etc.).
const origenesPermitidos = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: origenesPermitidos.length ? origenesPermitidos : true
}));
// Comprime HTML, CSS, JS y JSON (las páginas cargan más rápido)
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Montaje de rutas de la API
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/inmuebles', inmueblesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/mapa', mapaRoutes);
app.use('/api/config', configRoutes);
app.use('/api/tareas', tareasRoutes);

// Rutas de API inexistentes (404)
app.use('/api', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// El mismo servidor entrega el frontend: http://localhost:3000/
// HTML, CSS y JS se revalidan en cada visita (ETag) para que los cambios se vean al desplegar;
// las imágenes propias se guardan 7 días en el navegador
const carpetaFrontend = path.join(__dirname, '..', '..', 'frontend');
app.use('/assets', express.static(path.join(carpetaFrontend, 'assets'), { maxAge: '7d' }));
app.use(express.static(carpetaFrontend));

app.use((req, res) => {
  res.status(404).send('Página no encontrada');
});

app.use(errorHandler);

module.exports = app;
