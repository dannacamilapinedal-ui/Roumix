-- =============================================================================
-- 018 · Contrato en PDF sellado y documento de identidad de las partes (F-1)
-- -----------------------------------------------------------------------------
-- Un contrato de arrendamiento de vivienda (Ley 820 de 2003) identifica a las partes
-- con su documento. Cada usuario registra el suyo una vez; al enviar el contrato se
-- copia al contrato (queda tal cual lo firmaron aunque el usuario lo cambie después).
--
-- Al enviarse, Roumix genera el PDF definitivo, calcula su huella SHA-256 y lo guarda:
-- cualquier cambio posterior en el documento se detecta comparando la huella.
--
-- Solo agrega tablas y columnas: no borra datos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS documentos_identidad (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(4) NOT NULL CHECK (tipo IN ('CC', 'CE', 'PPT', 'PA')),
  numero VARCHAR(20) NOT NULL CHECK (numero ~ '^[A-Za-z0-9]{4,20}$'),
  nombre_completo VARCHAR(120) NOT NULL,       -- como aparece en el documento
  actualizado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un mismo documento no puede estar en dos cuentas (evita que alguien firme como otra persona)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_unico ON documentos_identidad (tipo, upper(numero));

-- Lo que queda escrito en el contrato
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS estudiante_documento VARCHAR(40);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS propietario_documento VARCHAR(40);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS plantilla_version VARCHAR(40);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS pdf_sha256 CHAR(64);

-- PDFs del contrato: el original enviado (y en F-4, el firmado con su certificado)
CREATE TABLE IF NOT EXISTS contratos_documentos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('original', 'firmado')),
  pdf BYTEA NOT NULL,
  sha256 CHAR(64) NOT NULL,
  bytes INTEGER NOT NULL,
  plantilla_version VARCHAR(40) NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (contrato_id, tipo)
);

ALTER TABLE documentos_identidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos_documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON documentos_identidad, contratos_documentos FROM anon, authenticated;
REVOKE ALL ON SEQUENCE contratos_documentos_id_seq FROM anon, authenticated;
