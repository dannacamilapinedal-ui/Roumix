-- =============================================================================
-- 007 · Verificación de propietarios
--
-- Un propietario completa su perfil y Roumix lo revisa antes de dejarlo publicar.
-- Estados: pendiente (en revisión) · aprobado · rechazado · requiere_informacion.
-- "perfil_enviado_en" vacío significa que todavía no ha enviado su perfil.
--
-- Lo que se comprueba se dice tal cual (no es una verificación legal de identidad
-- ni de propiedad del inmueble):
--   - correo: lo confirma Supabase Auth (ya existente)
--   - teléfono: el propietario lo declara; Roumix puede marcarlo "verificado por Roumix"
--     después de llamarlo durante la revisión.
-- No se piden fotos de documentos.
--
-- Las decisiones quedan en moderacion_historial (acciones verificacion_*).
-- Solo agrega estructuras: no borra ni modifica datos existentes, salvo crear la
-- verificación APROBADA de los propietarios que ya existían (decisión del equipo).
-- =============================================================================

CREATE TABLE IF NOT EXISTS verificaciones_propietario (
  propietario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  estado VARCHAR(30) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'requiere_informacion')),

  -- Perfil que completa el propietario
  nombre_completo VARCHAR(120),
  telefono VARCHAR(30),
  ciudad VARCHAR(80),
  relacion_inmueble VARCHAR(20)
    CHECK (relacion_inmueble IS NULL OR relacion_inmueble IN ('propietario', 'administrador', 'familiar', 'otro')),
  cantidad_inmuebles SMALLINT CHECK (cantidad_inmuebles IS NULL OR cantidad_inmuebles BETWEEN 1 AND 50),
  zonas VARCHAR(300),
  descripcion VARCHAR(1000),
  perfil_enviado_en TIMESTAMP WITH TIME ZONE,

  -- Condiciones comerciales aceptadas (respaldan la comisión del 10 %)
  acepta_comision BOOLEAN NOT NULL DEFAULT false,
  acepta_comision_en TIMESTAMP WITH TIME ZONE,
  version_condiciones VARCHAR(20),

  -- Lo que comprobó Roumix
  telefono_verificado_por_roumix BOOLEAN NOT NULL DEFAULT false,
  telefono_verificado_en TIMESTAMP WITH TIME ZONE,
  mensaje_admin VARCHAR(1000),
  revisado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  revisado_en TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verificaciones_estado ON verificaciones_propietario (estado);

ALTER TABLE verificaciones_propietario ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_verificaciones_updated_at ON verificaciones_propietario;
CREATE TRIGGER trg_verificaciones_updated_at
  BEFORE UPDATE ON verificaciones_propietario
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();

-- Propietarios existentes: quedan aprobados para que sus publicaciones sigan visibles
INSERT INTO verificaciones_propietario
  (propietario_id, estado, nombre_completo, telefono, perfil_enviado_en, mensaje_admin, revisado_en)
SELECT u.id, 'aprobado', u.nombre, u.telefono, CURRENT_TIMESTAMP,
       'Cuenta existente aprobada al activar la verificación de propietarios.', CURRENT_TIMESTAMP
FROM usuarios u
WHERE u.rol = 'propietario'
ON CONFLICT (propietario_id) DO NOTHING;

INSERT INTO moderacion_historial (usuario_afectado_id, accion, justificacion)
SELECT u.id, 'verificacion_aprobada', 'Aprobación automática de una cuenta existente al activar la verificación de propietarios.'
FROM usuarios u
WHERE u.rol = 'propietario'
  AND NOT EXISTS (
    SELECT 1 FROM moderacion_historial h
    WHERE h.usuario_afectado_id = u.id AND h.accion = 'verificacion_aprobada'
  );
