-- Desde ahora, cuando se aprueba el pago del primer mes el inmueble pasa solo a "arrendado"
-- y deja de aparecer en las búsquedas. Esta migración aplica la regla a los arriendos que
-- ya estaban pagados y con el contrato vigente.
UPDATE inmuebles i SET estado = 'arrendado'
WHERE i.estado IN ('disponible', 'pausado')
  AND EXISTS (
    SELECT 1 FROM solicitudes s
    JOIN contratos c ON c.solicitud_id = s.id AND c.estado = 'formalizado'
    WHERE s.inmueble_id = i.id AND s.estado IN ('pagado', 'completada')
      AND (c.fecha_inicio + make_interval(months => c.duracion_meses)) > CURRENT_DATE
  );
