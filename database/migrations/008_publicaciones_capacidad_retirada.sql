-- =============================================================================
-- 008 · Publicaciones: capacidad y estado comercial "retirado"
--
-- - capacidad: cuántas personas pueden vivir en el inmueble (opcional, 1 a 20).
-- - Estado comercial "retirado": el propietario retira la publicación del mercado.
--   Antes "Eliminar" la borraba para siempre; ahora se conserva (con sus fotos) para
--   que no se pierda el historial de solicitudes, contratos y pagos asociados.
--   Estados comerciales: disponible · pausado · arrendado · retirado.
--   (La moderación de Roumix sigue siendo independiente: aprobada, en_revision, ...)
-- Solo agrega: no borra ni modifica datos existentes.
-- =============================================================================

ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS capacidad SMALLINT;
ALTER TABLE inmuebles DROP CONSTRAINT IF EXISTS inmuebles_capacidad_check;
ALTER TABLE inmuebles ADD CONSTRAINT inmuebles_capacidad_check
  CHECK (capacidad IS NULL OR capacidad BETWEEN 1 AND 20);

ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS retirado_en TIMESTAMP WITH TIME ZONE;

ALTER TABLE inmuebles DROP CONSTRAINT IF EXISTS inmuebles_estado_check;
ALTER TABLE inmuebles ADD CONSTRAINT inmuebles_estado_check
  CHECK (estado IN ('disponible', 'pausado', 'arrendado', 'retirado'));
