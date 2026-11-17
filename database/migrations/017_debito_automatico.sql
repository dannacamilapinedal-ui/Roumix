-- =============================================================================
-- 017 · Débito automático mensual (meses 2 en adelante) con Wompi
-- -----------------------------------------------------------------------------
-- El estudiante guarda su tarjeta o su Nequi como "fuente de pago" en Wompi.
-- Roumix guarda SOLO el identificador de esa fuente y una descripción ("Visa •••• 4242"):
-- nunca el número de la tarjeta ni el CVC.
--
-- Cada mes, el día de pago, la tarea diaria cobra el canon. Comisión: 5 % a cargo del
-- propietario (condiciones versión 2026-12); el 95 % queda como desembolso pendiente.
-- Si un cobro falla: 3 intentos en 3 días, sin recargos de Roumix.
--
-- Solo agrega tablas y valores permitidos: no borra datos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS debitos_automaticos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE RESTRICT,     -- el pago del primer mes
  estudiante_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  propietario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  estado VARCHAR(12) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'cancelado', 'finalizado')),
  metodo VARCHAR(10) NOT NULL CHECK (metodo IN ('tarjeta', 'nequi')),
  fuente_wompi_id VARCHAR(40) NOT NULL,                                  -- payment_source_id de Wompi
  fuente_descripcion VARCHAR(60) NOT NULL,                               -- p. ej. "Visa •••• 4242"
  modo VARCHAR(12) NOT NULL CHECK (modo IN ('sandbox', 'produccion')),
  porcentaje_comision NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
  version_condiciones VARCHAR(20) NOT NULL,                              -- la que aceptó el propietario
  aceptacion_wompi_en TIMESTAMP WITH TIME ZONE NOT NULL,                 -- aceptó términos y datos personales de Wompi
  cancelado_en TIMESTAMP WITH TIME ZONE,
  motivo_cancelacion VARCHAR(300),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un solo débito activo por contrato
CREATE UNIQUE INDEX IF NOT EXISTS idx_debito_un_activo ON debitos_automaticos (contrato_id) WHERE estado = 'activo';

CREATE TABLE IF NOT EXISTS cobros_mensuales (
  id SERIAL PRIMARY KEY,
  debito_id INTEGER NOT NULL REFERENCES debitos_automaticos(id) ON DELETE RESTRICT,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  numero_mes SMALLINT NOT NULL CHECK (numero_mes >= 2),
  periodo_inicio DATE NOT NULL,
  fecha_cobro DATE NOT NULL,
  monto INTEGER NOT NULL CHECK (monto > 0),
  porcentaje_comision NUMERIC(5, 2) NOT NULL,
  comision INTEGER NOT NULL CHECK (comision >= 0),
  neto_propietario INTEGER NOT NULL CHECK (neto_propietario >= 0),
  estado VARCHAR(12) NOT NULL DEFAULT 'programado' CHECK (estado IN (
    'programado', 'en_proceso', 'aprobado', 'fallido', 'vencido', 'cancelado'
  )),
  intentos SMALLINT NOT NULL DEFAULT 0,
  proximo_intento DATE,
  referencia VARCHAR(60),                                                -- la del intento aprobado
  wompi_transaccion_id VARCHAR(60),
  ultimo_error VARCHAR(300),
  aprobado_en TIMESTAMP WITH TIME ZONE,
  desembolso_estado VARCHAR(12) CHECK (desembolso_estado IS NULL OR desembolso_estado IN ('pendiente', 'realizado')),
  desembolso_referencia VARCHAR(40),
  desembolso_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cobros_reparto_cuadra CHECK (comision + neto_propietario = monto)
);

-- Cada mes del contrato se cobra a lo sumo una vez (aunque se cancele y se reactive el débito)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cobros_mes_unico ON cobros_mensuales (contrato_id, numero_mes) WHERE estado <> 'cancelado';
CREATE INDEX IF NOT EXISTS idx_cobros_pendientes ON cobros_mensuales (estado, proximo_intento);

-- Cada intento de cobro en Wompi (referencia única)
CREATE TABLE IF NOT EXISTS cobros_intentos (
  id SERIAL PRIMARY KEY,
  cobro_id INTEGER NOT NULL REFERENCES cobros_mensuales(id) ON DELETE RESTRICT,
  referencia VARCHAR(60) NOT NULL UNIQUE,
  monto_centavos BIGINT NOT NULL CHECK (monto_centavos > 0),
  estado VARCHAR(12) NOT NULL DEFAULT 'creado' CHECK (estado IN ('creado', 'PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR')),
  wompi_transaccion_id VARCHAR(60) UNIQUE,
  mensaje VARCHAR(300),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE debitos_automaticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobros_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobros_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON debitos_automaticos, cobros_mensuales, cobros_intentos FROM anon, authenticated;
REVOKE ALL ON SEQUENCE debitos_automaticos_id_seq, cobros_mensuales_id_seq, cobros_intentos_id_seq FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_debitos_updated_at ON debitos_automaticos;
CREATE TRIGGER trg_debitos_updated_at BEFORE UPDATE ON debitos_automaticos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
DROP TRIGGER IF EXISTS trg_cobros_updated_at ON cobros_mensuales;
CREATE TRIGGER trg_cobros_updated_at BEFORE UPDATE ON cobros_mensuales
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
DROP TRIGGER IF EXISTS trg_cobros_intentos_updated_at ON cobros_intentos;
CREATE TRIGGER trg_cobros_intentos_updated_at BEFORE UPDATE ON cobros_intentos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
