-- =============================================================================
-- 020 · Firma manuscrita digitalizada y evidencias de cada firma (F-3)
-- -----------------------------------------------------------------------------
-- Cada parte firma una sola vez cada contrato. Se guarda:
--   · la imagen de la firma dibujada (PNG) y su huella SHA-256;
--   · el nombre escrito y el documento con que firmó;
--   · el texto EXACTO del consentimiento que aceptó;
--   · el código de un solo uso (F-2) que usó y el correo al que llegó;
--   · la huella del PDF que firmó (vínculo firma ↔ documento);
--   · fecha y hora, IP y dispositivo (navegador) desde donde firmó.
-- Con esto se puede demostrar quién firmó, que controlaba el medio de firma, qué
-- documento firmó y cuándo (Ley 527 de 1999 y Decreto 2364 de 2012).
--
-- La tabla es de solo adición: una firma no se modifica ni se borra (disparador).
-- Solo agrega una tabla: no borra datos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS firmas_contrato (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  rol VARCHAR(12) NOT NULL CHECK (rol IN ('arrendador', 'arrendatario')),
  nombre_escrito VARCHAR(120) NOT NULL,
  documento VARCHAR(40),
  firma_png BYTEA NOT NULL,
  firma_sha256 CHAR(64) NOT NULL,
  consentimiento TEXT NOT NULL,
  codigo_id INTEGER REFERENCES firmas_codigos(id) ON DELETE SET NULL,
  codigo_enviado_a VARCHAR(160) NOT NULL,
  pdf_sha256 CHAR(64),                      -- huella del PDF que firmó
  ip VARCHAR(64),
  dispositivo VARCHAR(300),
  firmado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (contrato_id, rol)
);

-- Una firma es evidencia: no se puede cambiar ni borrar (salvo las de las pruebas automáticas,
-- que se marcan con el parámetro roumix.pruebas)
CREATE OR REPLACE FUNCTION public.firmas_solo_adicion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('roumix.pruebas', true) = 'si' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Las firmas de un contrato no se pueden modificar ni borrar.';
END;
$$;

DROP TRIGGER IF EXISTS trg_firmas_solo_adicion ON firmas_contrato;
CREATE TRIGGER trg_firmas_solo_adicion BEFORE UPDATE OR DELETE ON firmas_contrato
  FOR EACH ROW EXECUTE FUNCTION public.firmas_solo_adicion();

ALTER TABLE firmas_contrato ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firmas_contrato FROM anon, authenticated;
REVOKE ALL ON SEQUENCE firmas_contrato_id_seq FROM anon, authenticated;
