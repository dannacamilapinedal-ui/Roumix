-- =============================================================================
-- 006 · Endurecer permisos y límites de uso persistentes
--
-- 1. Tabla limites_uso: marcas de intentos (registro, ingreso fallido) para que
--    los límites funcionen en Vercel (cada petición puede ir a otra instancia).
--    Guarda huellas (hash), nunca IP ni correos en claro. Se limpia a diario.
-- 2. Quita los privilegios que Supabase da por defecto a los roles "anon" y
--    "authenticated" sobre las tablas de Roumix. Solo el backend (conexión directa)
--    accede a estas tablas; RLS ya las bloqueaba, esto agrega una segunda barrera.
--    No modifica ni borra datos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS limites_uso (
  id BIGSERIAL PRIMARY KEY,
  clave VARCHAR(80) NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_limites_uso_clave_fecha ON limites_uso (clave, creado_en DESC);

ALTER TABLE limites_uso ENABLE ROW LEVEL SECURITY;

-- Tablas y secuencias existentes
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Tablas y secuencias que se creen en el futuro con este mismo usuario
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
