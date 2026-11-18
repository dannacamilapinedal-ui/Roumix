-- =============================================================================
-- 021 · PDF firmado con certificado y verificación pública (F-4)
-- -----------------------------------------------------------------------------
-- Al firmar la segunda parte, Roumix estampa las firmas en el PDF original y le
-- agrega una página de certificado con las evidencias. El resultado se guarda como
-- contratos_documentos tipo 'firmado' y se le asigna un código de verificación
-- público (no adivinable) con el que cualquiera puede comprobar el documento.
--
-- Solo agrega columnas: no borra datos.
-- =============================================================================

-- Dónde van las firmas en el PDF original (página y recuadro de cada rol)
ALTER TABLE contratos_documentos ADD COLUMN IF NOT EXISTS cajas_firma JSONB;

-- Código de verificación y huella del PDF firmado
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS codigo_verificacion VARCHAR(24);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS pdf_firmado_sha256 CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_codigo_verificacion ON contratos (codigo_verificacion) WHERE codigo_verificacion IS NOT NULL;
