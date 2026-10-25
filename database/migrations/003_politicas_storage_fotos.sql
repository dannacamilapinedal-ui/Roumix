-- ============================================================================
-- ROUMIX - MIGRACIÓN 003
-- Políticas de Supabase Storage para las fotos de los inmuebles.
--
-- El backend sube las fotos con el token de sesión del propietario (no con una
-- clave secreta). Estas políticas garantizan que cada propietario solo pueda
-- subir, ver en la API y borrar archivos dentro de su carpeta: inmuebles/<su id>/...
-- La lectura pública de las fotos se hace por la URL pública del bucket.
-- ============================================================================

-- 1. ¿El usuario autenticado es propietario?
-- SECURITY DEFINER porque usuarios tiene RLS sin políticas.
CREATE OR REPLACE FUNCTION public.es_propietario()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND rol = 'propietario'
  );
$$;

REVOKE ALL ON FUNCTION public.es_propietario() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_propietario() TO authenticated;

-- 2. Subir: solo propietarios y solo en su propia carpeta
DROP POLICY IF EXISTS "roumix_fotos_subir_propias" ON storage.objects;
CREATE POLICY "roumix_fotos_subir_propias"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inmuebles'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.es_propietario()
  );

-- 3. Consultar por la API (necesario para borrar): solo su carpeta
DROP POLICY IF EXISTS "roumix_fotos_ver_propias" ON storage.objects;
CREATE POLICY "roumix_fotos_ver_propias"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'inmuebles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Borrar: solo su carpeta
DROP POLICY IF EXISTS "roumix_fotos_borrar_propias" ON storage.objects;
CREATE POLICY "roumix_fotos_borrar_propias"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'inmuebles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
