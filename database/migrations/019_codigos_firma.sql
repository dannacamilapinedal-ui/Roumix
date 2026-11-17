-- =============================================================================
-- 019 · Código de un solo uso para firmar el contrato (F-2)
-- -----------------------------------------------------------------------------
-- Para aceptar (firmar) un contrato, cada parte recibe en su correo confirmado un
-- código de 6 dígitos. Demuestra que la firma la hizo quien controla esa cuenta y ese
-- correo (Decreto 2364 de 2012: el mecanismo debe estar bajo control del firmante).
--
--   · Del código solo se guarda su huella (SHA-256 con sal), nunca el código.
--   · Vence a los 10 minutos, admite 5 intentos y se usa una sola vez.
--   · Pedir uno nuevo anula el anterior.
--
-- Solo agrega una tabla: no borra datos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS firmas_codigos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_huella CHAR(64) NOT NULL,
  sal CHAR(32) NOT NULL,
  enviado_a VARCHAR(160) NOT NULL,              -- correo al que se envió (evidencia)
  expira_en TIMESTAMP WITH TIME ZONE NOT NULL,
  intentos SMALLINT NOT NULL DEFAULT 0,
  usado_en TIMESTAMP WITH TIME ZONE,            -- se verificó y se usó para firmar
  anulado_en TIMESTAMP WITH TIME ZONE,          -- se pidió otro o se agotaron los intentos
  ip_huella VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_firmas_codigos_parte ON firmas_codigos (contrato_id, usuario_id, created_at DESC);

ALTER TABLE firmas_codigos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firmas_codigos FROM anon, authenticated;
REVOKE ALL ON SEQUENCE firmas_codigos_id_seq FROM anon, authenticated;
