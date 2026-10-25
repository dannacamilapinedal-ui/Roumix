-- ============================================================================
-- ROUMIX - MIGRACIÓN 002
-- Perfiles ligados a Supabase Auth, propietario real en inmuebles,
-- restricciones, RLS y bucket de imágenes.
-- ============================================================================

-- 1. LIMPIEZA DE DATOS DE EJEMPLO
-- Los perfiles creados a mano no tienen cuenta en Supabase Auth, así que no
-- pueden cumplir la nueva clave foránea. Sus inmuebles quedan sin propietario
-- (datos de demostración) y los perfiles huérfanos se eliminan.
UPDATE inmuebles i
SET propietario_id = NULL
WHERE propietario_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = i.propietario_id);

DELETE FROM usuarios u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

-- 2. USUARIOS = PERFIL DE UNA CUENTA DE SUPABASE AUTH
-- El id ya no se genera aquí: es el mismo id de auth.users.
-- Las contraseñas viven únicamente en Supabase Auth.
ALTER TABLE usuarios ALTER COLUMN id DROP DEFAULT;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_id_auth_fkey;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_id_auth_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE usuarios ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. INMUEBLES: EL PROPIETARIO SE OBTIENE DEL PERFIL, NO DE TEXTO LIBRE
ALTER TABLE inmuebles DROP CONSTRAINT IF EXISTS inmuebles_propietario_id_fkey;
ALTER TABLE inmuebles
  ADD CONSTRAINT inmuebles_propietario_id_fkey
  FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- Nombre y teléfono se leen de usuarios mediante JOIN.
ALTER TABLE inmuebles DROP COLUMN IF EXISTS propietario_nombre;
ALTER TABLE inmuebles DROP COLUMN IF EXISTS propietario_telefono;

ALTER TABLE inmuebles ALTER COLUMN estado SET NOT NULL;
ALTER TABLE inmuebles ALTER COLUMN amenidades SET NOT NULL;
ALTER TABLE inmuebles ALTER COLUMN galeria SET NOT NULL;
ALTER TABLE inmuebles ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE inmuebles DROP CONSTRAINT IF EXISTS inmuebles_galeria_max;
ALTER TABLE inmuebles ADD CONSTRAINT inmuebles_galeria_max CHECK (cardinality(galeria) <= 10);

CREATE INDEX IF NOT EXISTS idx_inmuebles_propietario ON inmuebles(propietario_id);

-- 4. updated_at AUTOMÁTICO
CREATE OR REPLACE FUNCTION public.actualizar_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON usuarios;
CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();

DROP TRIGGER IF EXISTS trg_inmuebles_updated_at ON inmuebles;
CREATE TRIGGER trg_inmuebles_updated_at
  BEFORE UPDATE ON inmuebles
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();

-- 5. PERFIL AUTOMÁTICO AL REGISTRARSE
-- Cuando Supabase Auth crea una cuenta, se crea su fila en usuarios con los
-- datos enviados en el registro (options.data: nombre, rol, telefono, universidad).
-- El rol solo se lee en el registro; después el backend lo toma de esta tabla.
CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.usuarios (id, nombre, email, rol, telefono, universidad)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), ''), SPLIT_PART(NEW.email, '@', 1)), 120),
    NEW.email,
    CASE WHEN NEW.raw_user_meta_data->>'rol' = 'propietario' THEN 'propietario' ELSE 'estudiante' END,
    LEFT(NULLIF(TRIM(NEW.raw_user_meta_data->>'telefono'), ''), 30),
    LEFT(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'universidad'), ''), 'Santo Tomás'), 100)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_usuario();

-- 6. ROW LEVEL SECURITY
-- Sin políticas, la API pública de Supabase (anon / authenticated) no puede leer
-- ni escribir estas tablas. Todo acceso pasa por el backend Express, que se
-- conecta como propietario de las tablas y aplica sus propias validaciones.
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE inmuebles ENABLE ROW LEVEL SECURITY;

-- 7. BUCKET DE IMÁGENES (Supabase Storage)
-- Lectura pública de las fotos; la subida se hará desde el backend.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('inmuebles', 'inmuebles', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
