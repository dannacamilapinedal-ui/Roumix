-- =============================================================================
-- 010 · Comunicación gestionada
--
-- Cada estudiante o propietario conversa SOLO con el equipo de Roumix. No existe
-- ninguna conversación entre estudiante y propietario.
--
-- - conversaciones: un hilo entre un usuario y Roumix, opcionalmente ligado a una
--   vivienda o a una solicitud de arriendo. Estado: pendiente (espera respuesta
--   de Roumix) o atendida.
-- - mensajes: tipo "mensaje" (lo ven el usuario y Roumix) o "nota_interna" (solo
--   el equipo de Roumix).
-- - notificaciones: novedades para cada usuario (respuestas de Roumix, cambios en
--   sus solicitudes).
--
-- Solo agrega tablas nuevas: no borra ni modifica datos existentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversaciones (
  id SERIAL PRIMARY KEY,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  usuario_rol VARCHAR(20) NOT NULL CHECK (usuario_rol IN ('estudiante', 'propietario')),
  inmueble_id INTEGER REFERENCES inmuebles(id) ON DELETE SET NULL,
  solicitud_id INTEGER REFERENCES solicitudes(id) ON DELETE SET NULL,
  asunto VARCHAR(150) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'atendida')),
  iniciada_por VARCHAR(20) NOT NULL DEFAULT 'usuario' CHECK (iniciada_por IN ('usuario', 'admin')),
  ultimo_mensaje_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Última vez que cada lado leyó el hilo (para marcar lo no leído)
  leida_usuario_en TIMESTAMP WITH TIME ZONE,
  leida_admin_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversaciones_usuario ON conversaciones (usuario_id, ultimo_mensaje_en DESC);
CREATE INDEX IF NOT EXISTS idx_conversaciones_estado ON conversaciones (estado, ultimo_mensaje_en DESC);
-- Roumix tiene a lo sumo un hilo por usuario y solicitud
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversaciones_solicitud
  ON conversaciones (usuario_id, solicitud_id) WHERE solicitud_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mensajes (
  id SERIAL PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor_rol VARCHAR(20) NOT NULL CHECK (autor_rol IN ('estudiante', 'propietario', 'admin')),
  tipo VARCHAR(20) NOT NULL DEFAULT 'mensaje' CHECK (tipo IN ('mensaje', 'nota_interna')),
  cuerpo VARCHAR(2000) NOT NULL CHECK (length(btrim(cuerpo)) > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Solo el equipo de Roumix escribe notas internas
  CONSTRAINT mensajes_nota_solo_admin CHECK (tipo = 'mensaje' OR autor_rol = 'admin')
);

CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion ON mensajes (conversacion_id, created_at);

CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('mensaje', 'solicitud', 'verificacion', 'publicacion', 'sistema')),
  titulo VARCHAR(150) NOT NULL,
  cuerpo VARCHAR(500),
  enlace VARCHAR(300),
  leida_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_no_leidas ON notificaciones (usuario_id) WHERE leida_en IS NULL;

-- Mismo esquema de seguridad que el resto: solo el backend (conexión directa) accede
ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON conversaciones, mensajes, notificaciones FROM anon, authenticated;
REVOKE ALL ON SEQUENCE conversaciones_id_seq, mensajes_id_seq, notificaciones_id_seq FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_conversaciones_updated_at ON conversaciones;
CREATE TRIGGER trg_conversaciones_updated_at
  BEFORE UPDATE ON conversaciones
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
