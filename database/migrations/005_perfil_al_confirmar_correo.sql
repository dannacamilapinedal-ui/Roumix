-- ============================================================================
-- ROUMIX - MIGRACIÓN 005
-- El perfil de Roumix (tabla usuarios) se crea solo cuando la persona confirma
-- su correo. Así las cuentas con correos falsos o nunca confirmados no llenan la
-- tabla de perfiles (sus datos quedan solo en auth.users hasta que se confirman
-- o hasta que la limpieza automática las elimina a las 24 horas).
-- ============================================================================

-- 1. Función que crea el perfil a partir de los datos del registro.
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
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Al registrarse: solo si la cuenta ya viene confirmada (p. ej. si se desactiva la
--    confirmación de correo en Supabase o se crea desde el panel)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.crear_perfil_usuario();

-- 3. Al confirmar el correo con el enlace: se crea el perfil
DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.crear_perfil_usuario();

-- 4. Perfiles existentes de cuentas que nunca confirmaron el correo: se eliminan
--    (no pueden iniciar sesión; si confirman después, el perfil se crea de nuevo).
--    Solo perfiles sin inmuebles, para no borrar publicaciones por esta vía.
DELETE FROM usuarios u
USING auth.users a
WHERE a.id = u.id
  AND a.email_confirmed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM inmuebles i WHERE i.propietario_id = u.id);
