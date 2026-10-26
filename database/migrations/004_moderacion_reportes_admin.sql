-- ============================================================================
-- ROUMIX - MIGRACIÓN 004
-- Moderación de publicaciones, reportes, rol administrador, suspensión de
-- cuentas, historial de auditoría y consentimiento de tratamiento de datos.
--
-- Principio: el ESTADO COMERCIAL (disponible / pausado / arrendado) lo decide el
-- propietario; la MODERACIÓN (aprobada / en_revision / ...) la decide Roumix.
-- Son columnas separadas, así una revisión nunca reactiva algo que el
-- propietario había pausado por su cuenta.
-- ============================================================================

-- 1. ROLES Y ESTADO DE LA CUENTA
-- El rol 'admin' NO se puede elegir en el registro público (el trigger de perfil
-- solo crea estudiante o propietario). Se asigna con backend/scripts/asignar-admin.js.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('estudiante', 'propietario', 'admin'));

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'activo';
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_estado_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_estado_check CHECK (estado IN ('activo', 'suspendido'));

-- Fecha en que aceptó la política de tratamiento de datos (Ley 1581 de 2012)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS acepto_politica_en TIMESTAMP WITH TIME ZONE;

-- 2. MODERACIÓN DE INMUEBLES
--   aprobada         visible si además está 'disponible'
--   en_revision      oculta temporalmente (reporte recibido o cambios enviados)
--   requiere_cambios oculta hasta que el propietario corrija y se revise de nuevo
--   rechazada        oculta; no cumple las reglas
--   retirada         oculta de forma definitiva por Roumix
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS moderacion VARCHAR(20) NOT NULL DEFAULT 'aprobada';
ALTER TABLE inmuebles DROP CONSTRAINT IF EXISTS inmuebles_moderacion_check;
ALTER TABLE inmuebles ADD CONSTRAINT inmuebles_moderacion_check
  CHECK (moderacion IN ('aprobada', 'en_revision', 'requiere_cambios', 'rechazada', 'retirada'));

-- Mensaje de la última decisión, visible SOLO para el propietario
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS moderacion_mensaje VARCHAR(1000);

-- Revisión positiva registrada por Roumix (respalda la insignia "Revisada por Roumix")
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS revisado_en TIMESTAMP WITH TIME ZONE;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS revisado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;
-- Qué se comprobó en esa revisión (texto público, sin datos personales)
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS revision_alcance VARCHAR(300);

CREATE INDEX IF NOT EXISTS idx_inmuebles_moderacion ON inmuebles(moderacion);

-- 3. REPORTES
CREATE TABLE IF NOT EXISTS reportes (
  id SERIAL PRIMARY KEY,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE CASCADE,
  reportante_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo VARCHAR(30) NOT NULL CHECK (motivo IN (
    'fraude', 'informacion_falsa', 'fotos_no_corresponden',
    'precio_enganoso', 'contenido_inapropiado', 'otro'
  )),
  descripcion VARCHAR(1000),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procedente', 'no_procede')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelto_en TIMESTAMP WITH TIME ZONE,
  resuelto_por UUID REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Un usuario solo puede reportar una vez cada inmueble
CREATE UNIQUE INDEX IF NOT EXISTS ux_reportes_inmueble_reportante ON reportes(inmueble_id, reportante_id);
CREATE INDEX IF NOT EXISTS idx_reportes_estado ON reportes(estado);
CREATE INDEX IF NOT EXISTS idx_reportes_reportante_fecha ON reportes(reportante_id, created_at);

-- 4. HISTORIAL DE MODERACIÓN Y ACCIONES ADMINISTRATIVAS (auditoría)
CREATE TABLE IF NOT EXISTS moderacion_historial (
  id SERIAL PRIMARY KEY,
  inmueble_id INTEGER REFERENCES inmuebles(id) ON DELETE SET NULL,
  inmueble_titulo VARCHAR(200),              -- se conserva aunque el inmueble se elimine
  usuario_afectado_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES usuarios(id) ON DELETE SET NULL, -- NULL = acción automática del sistema
  accion VARCHAR(40) NOT NULL,
  moderacion_anterior VARCHAR(20),
  moderacion_nueva VARCHAR(20),
  justificacion VARCHAR(1000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_historial_inmueble ON moderacion_historial(inmueble_id);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON moderacion_historial(created_at DESC);

-- 5. RLS: como las demás tablas, solo el backend accede
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderacion_historial ENABLE ROW LEVEL SECURITY;

-- 6. PERFIL AUTOMÁTICO: guarda la aceptación de la política.
-- Sigue sin aceptar el rol 'admin' desde el registro.
CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.usuarios (id, nombre, email, rol, telefono, universidad, acepto_politica_en)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), ''), SPLIT_PART(NEW.email, '@', 1)), 120),
    NEW.email,
    CASE WHEN NEW.raw_user_meta_data->>'rol' = 'propietario' THEN 'propietario' ELSE 'estudiante' END,
    LEFT(NULLIF(TRIM(NEW.raw_user_meta_data->>'telefono'), ''), 30),
    LEFT(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'universidad'), ''), 'Santo Tomás'), 100),
    CASE WHEN NEW.raw_user_meta_data->>'acepto_politica' = 'true' THEN CURRENT_TIMESTAMP ELSE NULL END
  );
  RETURN NEW;
END;
$$;

-- 7. STORAGE: un propietario suspendido ya no puede subir fotos
CREATE OR REPLACE FUNCTION public.es_propietario()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND rol = 'propietario' AND estado = 'activo'
  );
$$;
