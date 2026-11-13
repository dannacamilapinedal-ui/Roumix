-- =============================================================================
-- 011 · Contratos de arrendamiento (flujo DEMOSTRATIVO)
--
-- El contrato es un acuerdo entre el estudiante (arrendatario) y el propietario
-- (arrendador). Roumix solo actúa como intermediario: prepara el documento con las
-- condiciones acordadas y registra la aceptación de cada parte.
--
-- IMPORTANTE: la "aceptación" es demostrativa (nombre escrito + fecha y hora). NO es
-- una firma electrónica con validez legal; para eso se debe integrar más adelante un
-- proveedor de firma electrónica certificado.
--
-- Estados: borrador · enviado · pendiente_aceptacion · formalizado · cancelado · expirado
--   borrador              Roumix lo está preparando (las partes no lo ven)
--   enviado               Roumix lo envió; ninguna parte lo ha aceptado
--   pendiente_aceptacion  Una parte lo aceptó; falta la otra
--   formalizado           Ambas partes lo aceptaron
--   cancelado             Roumix lo canceló antes de formalizarse
--   expirado              Venció el plazo de aceptación
-- Un contrato enviado ya no se edita: si hay que cambiarlo, se cancela y se hace otro.
--
-- Solo agrega una tabla nueva: no borra ni modifica datos existentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS contratos (
  id SERIAL PRIMARY KEY,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE RESTRICT,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE RESTRICT,
  estudiante_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  propietario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,

  estado VARCHAR(30) NOT NULL DEFAULT 'borrador' CHECK (estado IN (
    'borrador', 'enviado', 'pendiente_aceptacion', 'formalizado', 'cancelado', 'expirado'
  )),

  -- Datos de las partes y del inmueble tal como quedan en el documento
  estudiante_nombre VARCHAR(120) NOT NULL,
  propietario_nombre VARCHAR(120) NOT NULL,
  inmueble_titulo VARCHAR(200) NOT NULL,
  inmueble_direccion VARCHAR(200),

  -- Condiciones
  canon_mensual INTEGER NOT NULL CHECK (canon_mensual > 0),
  deposito INTEGER CHECK (deposito IS NULL OR deposito >= 0),
  fecha_inicio DATE NOT NULL,
  duracion_meses SMALLINT NOT NULL CHECK (duracion_meses BETWEEN 1 AND 24),
  dia_pago SMALLINT NOT NULL DEFAULT 5 CHECK (dia_pago BETWEEN 1 AND 28),
  servicios_incluidos VARCHAR(500),
  condiciones TEXT CHECK (condiciones IS NULL OR length(condiciones) <= 5000),

  -- Envío y aceptación demostrativa
  enviado_en TIMESTAMP WITH TIME ZONE,
  vence_en TIMESTAMP WITH TIME ZONE,
  huella VARCHAR(64),                       -- SHA-256 del contenido al enviarlo
  aceptado_estudiante_en TIMESTAMP WITH TIME ZONE,
  firma_estudiante VARCHAR(120),            -- nombre escrito por el estudiante
  aceptado_propietario_en TIMESTAMP WITH TIME ZONE,
  firma_propietario VARCHAR(120),
  formalizado_en TIMESTAMP WITH TIME ZONE,
  cancelado_en TIMESTAMP WITH TIME ZONE,
  motivo_cancelacion VARCHAR(500),

  creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT contratos_formalizado_coherente CHECK (
    estado <> 'formalizado' OR (aceptado_estudiante_en IS NOT NULL AND aceptado_propietario_en IS NOT NULL)
  )
);

-- Una solicitud tiene a lo sumo un contrato vigente (los cancelados y expirados quedan como historial)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_uno_vigente
  ON contratos (solicitud_id) WHERE estado NOT IN ('cancelado', 'expirado');

CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos (estado, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contratos_estudiante ON contratos (estudiante_id);
CREATE INDEX IF NOT EXISTS idx_contratos_propietario ON contratos (propietario_id);

ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON contratos FROM anon, authenticated;
REVOKE ALL ON SEQUENCE contratos_id_seq FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_contratos_updated_at ON contratos;
CREATE TRIGGER trg_contratos_updated_at
  BEFORE UPDATE ON contratos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
