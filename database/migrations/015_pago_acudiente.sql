-- =============================================================================
-- 015 · "Paga mi acudiente": enlace de pago único con vencimiento de 24 horas
-- -----------------------------------------------------------------------------
-- El estudiante genera un enlace para que un familiar o acudiente pague el primer
-- mes con Wompi SIN crear cuenta en Roumix.
--
--   · Del enlace solo se guarda la HUELLA (SHA-256) del código, nunca el código:
--     si alguien leyera la base de datos no podría usar los enlaces.
--   · Cada pago tiene a lo sumo un enlace activo: crear uno nuevo anula el anterior.
--   · El enlace vence a las 24 horas y deja de servir cuando el pago se aprueba.
--
-- Solo agrega tablas, columnas y valores permitidos: no borra datos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pagos_enlaces (
  id SERIAL PRIMARY KEY,
  pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE RESTRICT,
  token_huella CHAR(64) NOT NULL UNIQUE,           -- SHA-256 del código del enlace
  estado VARCHAR(10) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'revocado', 'usado')),
  expira_en TIMESTAMP WITH TIME ZONE NOT NULL,
  creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usado_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un solo enlace activo por pago
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_enlaces_un_activo
  ON pagos_enlaces (pago_id) WHERE estado = 'activo';

-- Quién abrió cada intento en Wompi (el estudiante o el acudiente por el enlace)
ALTER TABLE pagos_intentos_wompi ADD COLUMN IF NOT EXISTS origen VARCHAR(12) NOT NULL DEFAULT 'estudiante'
  CHECK (origen IN ('estudiante', 'acudiente'));
ALTER TABLE pagos_intentos_wompi ADD COLUMN IF NOT EXISTS enlace_id INTEGER REFERENCES pagos_enlaces(id) ON DELETE SET NULL;
ALTER TABLE pagos_intentos_wompi ADD COLUMN IF NOT EXISTS pagador_nombre VARCHAR(120);

-- Nombre de quien pagó (si no fue el estudiante), para el recibo
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS pagado_por VARCHAR(12) CHECK (pagado_por IS NULL OR pagado_por IN ('estudiante', 'acudiente'));
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS pagador_nombre VARCHAR(120);

-- Nuevos movimientos en el historial del pago
ALTER TABLE pagos_eventos DROP CONSTRAINT IF EXISTS pagos_eventos_tipo_check;
ALTER TABLE pagos_eventos ADD CONSTRAINT pagos_eventos_tipo_check CHECK (tipo IN (
  'habilitado', 'intento_aprobado', 'intento_rechazado', 'cancelado', 'devolucion',
  'disputa_abierta', 'disputa_resuelta', 'desembolso_realizado',
  'intento_iniciado', 'intento_en_proceso', 'requiere_devolucion',
  'enlace_creado', 'enlace_anulado'
));

ALTER TABLE pagos_enlaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pagos_enlaces FROM anon, authenticated;
REVOKE ALL ON SEQUENCE pagos_enlaces_id_seq FROM anon, authenticated;
