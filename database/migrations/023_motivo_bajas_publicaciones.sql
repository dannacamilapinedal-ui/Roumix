-- Cuando un propietario retira una publicación o la marca como arrendada a mano, debe
-- justificarlo. El motivo (código) queda junto a su explicación en el historial, para
-- que el equipo vea cuántas publicaciones se dan de baja por fuera de Roumix.
ALTER TABLE moderacion_historial ADD COLUMN IF NOT EXISTS motivo VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_historial_motivo ON moderacion_historial (motivo, created_at DESC)
  WHERE motivo IS NOT NULL;
