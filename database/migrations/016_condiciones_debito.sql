-- =============================================================================
-- 016 · Condiciones de comisión versión 2026-12 (débito automático mensual)
-- -----------------------------------------------------------------------------
-- Las condiciones nuevas mantienen el 10 % del primer canon y agregan un 5 % de
-- cada canon mensual que Roumix cobre por débito automático (meses 2 en adelante).
--
-- Esta tabla registra a qué propietario se le avisó de cada versión (aviso en la
-- plataforma y correo), para que el aviso salga UNA sola vez por propietario.
-- La aceptación sigue guardándose en verificaciones_propietario.version_condiciones.
--
-- Solo agrega una tabla: no borra ni modifica datos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS condiciones_avisos (
  propietario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  correo_enviado BOOLEAN NOT NULL DEFAULT false,
  avisado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  avisado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (propietario_id, version)
);

ALTER TABLE condiciones_avisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON condiciones_avisos FROM anon, authenticated;
