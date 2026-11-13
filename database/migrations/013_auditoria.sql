-- =============================================================================
-- 013 · Auditoría
--
-- Historial único de operaciones: cada acción administrativa sensible (moderar,
-- suspender, verificar, cambiar solicitudes, contratos, pagos, devoluciones…) y los
-- hitos de los usuarios (aceptar un contrato, pagar, aceptar condiciones).
--
-- - Es de SOLO ADICIÓN: un disparador impide modificar o borrar registros. La única
--   excepción son los registros de las pruebas automáticas (es_prueba = true), para
--   que las pruebas no ensucien el historial real.
-- - No tiene llaves foráneas a usuarios: si una cuenta se elimina, su rastro se
--   conserva (con el nombre que tenía en ese momento).
-- - moderacion_historial NO se elimina ni se modifica: sus registros se copian aquí
--   una sola vez, y los que escriban el sistema o los usuarios (sin admin) se copian
--   automáticamente con un disparador. Las acciones del admin las registra el backend.
-- =============================================================================

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID,
  actor_rol VARCHAR(20) NOT NULL CHECK (actor_rol IN ('admin', 'estudiante', 'propietario', 'sistema')),
  actor_nombre VARCHAR(120),
  accion VARCHAR(60) NOT NULL,
  entidad VARCHAR(30) NOT NULL,       -- inmueble, usuario, solicitud, contrato, pago, conversacion…
  entidad_id VARCHAR(60),
  resumen VARCHAR(500),
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_huella VARCHAR(64),              -- huella (hash) de la IP, nunca la IP en claro
  origen VARCHAR(20) NOT NULL DEFAULT 'backend' CHECK (origen IN ('backend', 'moderacion')),
  es_prueba BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria (entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_actor ON auditoria (actor_id);

-- Solo adición
CREATE OR REPLACE FUNCTION public.auditoria_solo_adicion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.es_prueba THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La auditoría es de solo adición: no se puede % un registro.',
    CASE TG_OP WHEN 'UPDATE' THEN 'modificar' ELSE 'borrar' END;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_solo_adicion ON auditoria;
CREATE TRIGGER trg_auditoria_solo_adicion
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION public.auditoria_solo_adicion();

-- Copia única del historial de moderación existente (no se toca el original)
INSERT INTO auditoria (actor_id, actor_rol, actor_nombre, accion, entidad, entidad_id, resumen, datos, origen, es_prueba, created_at)
SELECT h.admin_id,
       CASE WHEN h.admin_id IS NOT NULL THEN 'admin' WHEN afe.rol = 'propietario' THEN 'propietario' ELSE 'sistema' END,
       adm.nombre,
       h.accion,
       CASE WHEN h.inmueble_id IS NOT NULL THEN 'inmueble' ELSE 'usuario' END,
       COALESCE(h.inmueble_id::text, h.usuario_afectado_id::text),
       h.justificacion,
       jsonb_strip_nulls(jsonb_build_object(
         'inmueble_titulo', h.inmueble_titulo, 'moderacion_anterior', h.moderacion_anterior,
         'moderacion_nueva', h.moderacion_nueva, 'afectado', afe.nombre, 'historial_id', h.id)),
       'moderacion',
       COALESCE(afe.email LIKE '%@roumix.test', false),
       h.created_at
FROM moderacion_historial h
LEFT JOIN usuarios adm ON adm.id = h.admin_id
LEFT JOIN usuarios afe ON afe.id = h.usuario_afectado_id
WHERE NOT EXISTS (SELECT 1 FROM auditoria a WHERE a.origen = 'moderacion' AND a.datos->>'historial_id' = h.id::text);

-- Los registros nuevos de moderacion_historial hechos por el sistema o por usuarios
-- (sin admin) también llegan a la auditoría
CREATE OR REPLACE FUNCTION public.auditoria_desde_moderacion() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  afectado RECORD;
BEGIN
  IF NEW.admin_id IS NOT NULL THEN
    RETURN NEW;  -- las acciones del admin las registra el backend con más detalle
  END IF;
  SELECT nombre, rol, email INTO afectado FROM usuarios WHERE id = NEW.usuario_afectado_id;
  INSERT INTO auditoria (actor_id, actor_rol, actor_nombre, accion, entidad, entidad_id, resumen, datos, origen, es_prueba)
  VALUES (
    CASE WHEN afectado.rol = 'propietario' THEN NEW.usuario_afectado_id END,
    CASE WHEN afectado.rol = 'propietario' THEN 'propietario' ELSE 'sistema' END,
    CASE WHEN afectado.rol = 'propietario' THEN afectado.nombre END,
    NEW.accion,
    CASE WHEN NEW.inmueble_id IS NOT NULL THEN 'inmueble' ELSE 'usuario' END,
    COALESCE(NEW.inmueble_id::text, NEW.usuario_afectado_id::text),
    NEW.justificacion,
    jsonb_strip_nulls(jsonb_build_object('inmueble_titulo', NEW.inmueble_titulo, 'moderacion_anterior', NEW.moderacion_anterior,
      'moderacion_nueva', NEW.moderacion_nueva, 'historial_id', NEW.id)),
    'moderacion',
    COALESCE(afectado.email LIKE '%@roumix.test', false)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_desde_moderacion ON moderacion_historial;
CREATE TRIGGER trg_auditoria_desde_moderacion
  AFTER INSERT ON moderacion_historial
  FOR EACH ROW EXECUTE FUNCTION public.auditoria_desde_moderacion();

ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auditoria FROM anon, authenticated;
REVOKE ALL ON SEQUENCE auditoria_id_seq FROM anon, authenticated;
