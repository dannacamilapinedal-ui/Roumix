require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Rutas
const healthRoutes = require('./routes/healthRoutes');
const inmueblesRoutes = require('./routes/inmueblesRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales
app.use(cors());
app.use(express.json());

// Montaje de rutas de la API
app.use('/api/health', healthRoutes);
app.use('/api/inmuebles', inmueblesRoutes);

// Ruta base informativa
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; padding: 50px;">
      <h1 style="color: #142219;">Roumix API · Backend Activo 🏠</h1>
      <p style="color: #546250;">El servidor Node.js y Express está escuchando peticiones.</p>
      <div style="display: flex; gap: 16px; justify-content: center; margin-top: 20px;">
        <a href="/api/health" style="color: #c47c2b; font-weight: bold; text-decoration: none; padding: 8px 16px; border: 1px solid #c47c2b; border-radius: 20px;">🩺 Probar /api/health</a>
        <a href="/api/inmuebles" style="color: #142219; font-weight: bold; text-decoration: none; padding: 8px 16px; border: 1px solid #142219; border-radius: 20px;">🏠 Ver Inmuebles (/api/inmuebles)</a>
      </div>
    </div>
  `);
});

// Manejo de rutas inexistentes (404)
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Servidor Roumix iniciado con éxito`);
  console.log(`📡 URL local: http://localhost:${PORT}`);
  console.log(`🩺 Endpoint de salud: http://localhost:${PORT}/api/health`);
  console.log(`🏠 Endpoint inmuebles: http://localhost:${PORT}/api/inmuebles`);
  console.log(`====================================================`);
});
