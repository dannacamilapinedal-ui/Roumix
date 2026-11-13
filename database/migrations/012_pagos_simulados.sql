-- =============================================================================
-- 012 · Pagos SIMULADOS, comisión, desembolsos, devoluciones y disputas
--
-- Roumix todavía no tiene un proveedor de pagos autorizado: TODOS los pagos son
-- demostrativos y no mueven dinero real. La columna "simulado" no se puede poner en
-- falso (CHECK): integrar un proveedor real exigirá una migración nueva y revisada.
-- No se guardan datos de tarjetas ni cuentas bancarias.
--
-- Flujo: contrato formalizado → pago habilitado (pendiente) → el estudiante paga el
-- primer canon → el simulador lo aprueba o lo rechaza → si se aprueba se registra la
-- comisión del 10 % (a cargo del propietario, una sola vez) y queda pendiente el
-- desembolso del 90 % restante al propietario.
--
-- Solo agrega tablas nuevas: no borra ni modifica datos existentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pagos (
  id SERIAL PRIMARY KEY,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE RESTRICT,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  estudiante_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  propietario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,

  concepto VARCHAR(30) NOT NULL DEFAULT 'primer_canon' CHECK (concepto IN ('primer_canon')),
  monto INTEGER NOT NULL CHECK (monto > 0),                 -- lo que paga el estudiante (canon completo)
  porcentaje_comision NUMERIC(5, 2) NOT NULL DEFAULT 10.00 CHECK (porcentaje_comision >= 0 AND porcentaje_comision <= 100),
  comision INTEGER NOT NULL CHECK (comision >= 0),          -- a cargo del propietario
  neto_propietario INTEGER NOT NULL CHECK (neto_propietario >= 0),
  moneda CHAR(3) NOT NULL DEFAULT 'COP',

  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente', 'aprobado', 'fallido', 'cancelado', 'reembolsado', 'en_disputa'
  )),
  simulado BOOLEAN NOT NULL DEFAULT TRUE CHECK (simulado = TRUE),
  proveedor VARCHAR(40) NOT NULL DEFAULT 'simulador_roumix',
  metodo VARCHAR(30) CHECK (metodo IS NULL OR metodo IN ('tarjeta_simulada', 'pse_simulado', 'nequi_simulado')),
  referencia VARCHAR(40) UNIQUE,                           -- referencia de la transacción aprobada
  intentos SMALLINT NOT NULL DEFAULT 0,
  ultimo_error VARCHAR(300),
  aprobado_en TIMESTAMP WITH TIME ZONE,
  cerrado_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pagos_reparto_cuadra CHECK (comision + neto_propietario = monto)
);

-- Un contrato tiene a lo sumo un pago vivo del primer canon
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_uno_por_contrato
  ON pagos (contrato_id) WHERE estado NOT IN ('cancelado');
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos (estado, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_estudiante ON pagos (estudiante_id);
CREATE INDEX IF NOT EXISTS idx_pagos_propietario ON pagos (propietario_id);

-- Registro de cada movimiento (intentos, aprobaciones, devoluciones, disputas…)
CREATE TABLE IF NOT EXISTS pagos_eventos (
  id SERIAL PRIMARY KEY,
  pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
    'habilitado', 'intento_aprobado', 'intento_rechazado', 'cancelado', 'devolucion',
    'disputa_abierta', 'disputa_resuelta', 'desembolso_realizado'
  )),
  referencia VARCHAR(40),
  monto INTEGER,
  detalle VARCHAR(500),
  autor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor_rol VARCHAR(20) NOT NULL CHECK (autor_rol IN ('estudiante', 'propietario', 'admin', 'sistema')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pagos_eventos ON pagos_eventos (pago_id, created_at);

-- Comisión de Roumix: 10 % del primer canon, una sola vez, respaldada por las
-- condiciones que el propietario aceptó (se guarda la versión)
CREATE TABLE IF NOT EXISTS comisiones (
  id SERIAL PRIMARY KEY,
  pago_id INTEGER NOT NULL UNIQUE REFERENCES pagos(id) ON DELETE RESTRICT,
  propietario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  monto INTEGER NOT NULL CHECK (monto >= 0),
  porcentaje NUMERIC(5, 2) NOT NULL,
  version_condiciones VARCHAR(20) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'registrada' CHECK (estado IN ('registrada', 'anulada')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  anulada_en TIMESTAMP WITH TIME ZONE
);

-- Desembolso del saldo al propietario (también simulado)
CREATE TABLE IF NOT EXISTS desembolsos (
  id SERIAL PRIMARY KEY,
  pago_id INTEGER NOT NULL UNIQUE REFERENCES pagos(id) ON DELETE RESTRICT,
  propietario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  monto INTEGER NOT NULL CHECK (monto >= 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'retenido', 'realizado', 'anulado')),
  referencia VARCHAR(40),
  realizado_en TIMESTAMP WITH TIME ZONE,
  nota VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_desembolsos_estado ON desembolsos (estado);

-- Devoluciones al estudiante (simuladas)
CREATE TABLE IF NOT EXISTS devoluciones (
  id SERIAL PRIMARY KEY,
  pago_id INTEGER NOT NULL UNIQUE REFERENCES pagos(id) ON DELETE RESTRICT,
  monto INTEGER NOT NULL CHECK (monto > 0),
  motivo VARCHAR(500) NOT NULL,
  referencia VARCHAR(40) NOT NULL,
  autor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE desembolsos ENABLE ROW LEVEL SECURITY;
ALTER TABLE devoluciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pagos, pagos_eventos, comisiones, desembolsos, devoluciones FROM anon, authenticated;
REVOKE ALL ON SEQUENCE pagos_id_seq, pagos_eventos_id_seq, comisiones_id_seq, desembolsos_id_seq, devoluciones_id_seq FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_pagos_updated_at ON pagos;
CREATE TRIGGER trg_pagos_updated_at BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
DROP TRIGGER IF EXISTS trg_desembolsos_updated_at ON desembolsos;
CREATE TRIGGER trg_desembolsos_updated_at BEFORE UPDATE ON desembolsos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
