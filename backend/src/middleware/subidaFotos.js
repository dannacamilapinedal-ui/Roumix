const multer = require('multer');
const { MAX_FOTOS_POR_ENVIO, MAX_BYTES } = require('../services/fotosService');

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

// Las fotos se mantienen en memoria solo mientras se suben a Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_FOTOS_POR_ENVIO, fields: 5, fieldSize: 100 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
      const err = new Error(`"${file.originalname}" no es una imagen JPG, PNG o WebP.`);
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
}).array('fotos', MAX_FOTOS_POR_ENVIO);

const MENSAJES = {
  LIMIT_FILE_SIZE: 'Cada foto puede pesar máximo 5 MB.',
  LIMIT_FILE_COUNT: `Puedes subir máximo ${MAX_FOTOS_POR_ENVIO} fotos a la vez.`,
  LIMIT_UNEXPECTED_FILE: `Puedes subir máximo ${MAX_FOTOS_POR_ENVIO} fotos a la vez.`
};

/**
 * Recibe multipart/form-data con los campos "datos" (JSON) y "fotos" (archivos).
 * Deja los datos ya interpretados en req.body.
 */
function subidaFotos(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        err.status = 400;
        err.message = MENSAJES[err.code] || 'No se pudieron recibir las fotos.';
      }
      return next(err);
    }

    if (typeof req.body.datos === 'string') {
      try {
        req.body = JSON.parse(req.body.datos);
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new Error('no es un objeto');
      } catch (e) {
        const error = new Error('Los datos del inmueble no son un JSON válido.');
        error.status = 400;
        return next(error);
      }
    }
    req.files = req.files || [];
    next();
  });
}

module.exports = subidaFotos;
