-- =============================================================================
-- 014 · Pagos reales con Wompi (pasarela de pagos de Bancolombia)
-- -----------------------------------------------------------------------------
-- Hasta ahora todos los pagos eran simulados (CHECK simulado = TRUE). Esta migración
-- permite registrar pagos procesados por Wompi, sin tocar los simulados existentes:
--
--   · Un pago solo puede tener simulado = FALSE si su proveedor es 'wompi'.
--   · Cada vez que el estudiante abre la pasarela se crea un "intento" con una
--     referencia única (Wompi exige una referencia distinta por transacción).
--   · Cada evento que Wompi envía al webhook queda guardado (con su firma
--     verificada) para poder auditarlo y no procesarlo dos veces.
--
-- Roumix NUNCA guarda datos de tarjetas ni de cuentas: los captura el widget de Wompi.
-- Solo agrega columnas, tablas y valores permitidos: no borra datos.
-- =============================================================================

-- Pagos reales permitidos solo con proveedor Wompi
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_simulado_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_simulado_check
  CHECK (simulado = TRUE OR proveedor = 'wompi');

-- Métodos que reporta Wompi (además de los simulados)
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_metodo_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_metodo_check CHECK (metodo IS NULL OR metodo IN (
  'tarjeta_simulada', 'pse_simulado', 'nequi_simulado',
  'tarjeta', 'pse', 'nequi', 'boton_bancolombia', 'qr_bancolombia', 'daviplata',
  'corresponsal_bancario', 'bnpl_bancolombia', 'su_plus', 'otro'
));

-- Ambiente de Wompi con el que se aprobó (sandbox = pruebas, produccion = dinero real)
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS modo_wompi VARCHAR(12)
  CHECK (modo_wompi IS NULL OR modo_wompi IN ('sandbox', 'produccion'));
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS wompi_transaccion_id VARCHAR(60);

-- Nuevos tipos de movimiento en el historial del pago
ALTER TABLE pagos_eventos DROP CONSTRAINT IF EXISTS pagos_eventos_tipo_check;
ALTER TABLE pagos_eventos ADD CONSTRAINT pagos_eventos_tipo_check CHECK (tipo IN (
  'habilitado', 'intento_aprobado', 'intento_rechazado', 'cancelado', 'devolucion',
  'disputa_abierta', 'disputa_resuelta', 'desembolso_realizado',
  'intento_iniciado', 'intento_en_proceso', 'requiere_devolucion'
));

-- Cada apertura de la pasarela (una referencia única por intento)
CREATE TABLE IF NOT EXISTS pagos_intentos_wompi (
  id SERIAL PRIMARY KEY,
  pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE RESTRICT,
  referencia VARCHAR(60) NOT NULL UNIQUE,
  monto_centavos BIGINT NOT NULL CHECK (monto_centavos > 0),
  moneda CHAR(3) NOT NULL DEFAULT 'COP',
  modo VARCHAR(12) NOT NULL CHECK (modo IN ('sandbox', 'produccion')),
  estado VARCHAR(12) NOT NULL DEFAULT 'creado' CHECK (estado IN ('creado', 'PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR')),
  wompi_transaccion_id VARCHAR(60) UNIQUE,
  metodo VARCHAR(30),
  mensaje VARCHAR(300),
  creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intentos_wompi_pago ON pagos_intentos_wompi (pago_id, created_at DESC);

-- Eventos recibidos de Wompi (webhook), con la firma ya verificada
CREATE TABLE IF NOT EXISTS wompi_eventos (
  id SERIAL PRIMARY KEY,
  evento VARCHAR(60) NOT NULL,
  checksum VARCHAR(64) NOT NULL UNIQUE,          -- el mismo evento reenviado no se procesa dos veces
  transaccion_id VARCHAR(60),
  referencia VARCHAR(60),
  estado VARCHAR(12),
  ambiente VARCHAR(12),
  resultado VARCHAR(40) NOT NULL,                 -- aplicado, sin_cambios, referencia_desconocida, ...
  datos JSONB NOT NULL,
  recibido_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wompi_eventos_ref ON wompi_eventos (referencia);

ALTER TABLE pagos_intentos_wompi ENABLE ROW LEVEL SECURITY;
ALTER TABLE wompi_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pagos_intentos_wompi, wompi_eventos FROM anon, authenticated;
REVOKE ALL ON SEQUENCE pagos_intentos_wompi_id_seq, wompi_eventos_id_seq FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_intentos_wompi_updated_at ON pagos_intentos_wompi;
CREATE TRIGGER trg_intentos_wompi_updated_at BEFORE UPDATE ON pagos_intentos_wompi
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
