-- =============================================================================
-- 009 · Solicitudes de arriendo (reemplaza el contacto directo por WhatsApp)
--
-- El estudiante envía una solicitud desde la publicación. Roumix la recibe en su
-- panel, la revisa, habla con el propietario y coordina todo el proceso. Estudiante
-- y propietario nunca ven los datos de contacto del otro.
--
-- Estados: recibida · en_revision · aceptada · rechazada · visita_coordinada ·
-- en_negociacion · contrato_pendiente · contrato_formalizado · pago_pendiente ·
-- pagado · completada · cancelada.
-- contrato_formalizado, pago_pendiente y pagado solo los pondrá el sistema
-- (módulos de contratos y pagos): nunca a mano.
--
-- Solo agrega tablas nuevas: no borra ni modifica datos existentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS solicitudes (
  id SERIAL PRIMARY KEY,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE RESTRICT,
  estudiante_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  propietario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Copia de lo que vio el estudiante al enviar (el inmueble puede cambiar después)
  inmueble_titulo VARCHAR(200) NOT NULL,
  canon_mensual INTEGER NOT NULL CHECK (canon_mensual > 0),

  estado VARCHAR(30) NOT NULL DEFAULT 'recibida' CHECK (estado IN (
    'recibida', 'en_revision', 'aceptada', 'rechazada', 'visita_coordinada',
    'en_negociacion', 'contrato_pendiente', 'contrato_formalizado',
    'pago_pendiente', 'pagado', 'completada', 'cancelada'
  )),

  -- Lo que cuenta el estudiante (solo lo lee el equipo de Roumix)
  fecha_ingreso DATE NOT NULL,
  duracion_meses SMALLINT NOT NULL CHECK (duracion_meses BETWEEN 1 AND 24),
  personas SMALLINT NOT NULL DEFAULT 1 CHECK (personas BETWEEN 1 AND 20),
  mensaje VARCHAR(1000),

  -- Momento en que Roumix la compartió con el propietario (antes él no la ve)
  compartida_propietario_en TIMESTAMP WITH TIME ZONE,
  cerrada_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un estudiante solo puede tener una solicitud abierta por inmueble
CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitudes_una_abierta
  ON solicitudes (inmueble_id, estudiante_id)
  WHERE estado NOT IN ('rechazada', 'completada', 'cancelada');

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estudiante ON solicitudes (estudiante_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_propietario ON solicitudes (propietario_id, created_at DESC);

-- Historial de cada solicitud. Cada nota tiene un destinatario distinto:
-- nota_estudiante (la ve el estudiante), nota_propietario (la ve el propietario)
-- y nota_interna (solo el equipo de Roumix).
CREATE TABLE IF NOT EXISTS solicitudes_historial (
  id SERIAL PRIMARY KEY,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  estado_anterior VARCHAR(30),
  estado_nuevo VARCHAR(30),
  autor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor_rol VARCHAR(20) NOT NULL CHECK (autor_rol IN ('estudiante', 'admin', 'sistema')),
  nota_estudiante VARCHAR(1000),
  nota_propietario VARCHAR(1000),
  nota_interna VARCHAR(1000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_historial ON solicitudes_historial (solicitud_id, created_at);

-- Mismo esquema de seguridad que el resto: solo el backend (conexión directa) accede
ALTER TABLE solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_historial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON solicitudes, solicitudes_historial FROM anon, authenticated;
REVOKE ALL ON SEQUENCE solicitudes_id_seq, solicitudes_historial_id_seq FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_solicitudes_updated_at ON solicitudes;
CREATE TRIGGER trg_solicitudes_updated_at
  BEFORE UPDATE ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
