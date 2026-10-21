-- ============================================================================
-- ROUMIX - DATOS SEMILLA DE PRUEBA (VILLAVICENCIO)
-- ============================================================================

-- Usuario Propietario de prueba
INSERT INTO usuarios (id, nombre, email, rol, telefono, universidad)
VALUES 
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Marta Ruiz', 'marta.ruiz@ejemplo.com', 'propietario', '573108845612', 'Santo Tomás')
ON CONFLICT (email) DO NOTHING;

-- Inmuebles iniciales
INSERT INTO inmuebles (
  id, propietario_id, titulo, tipo, tipo_label, precio, barrio, universidad, 
  distancia_texto, distancia_metros, tiempo_pie, estrato, area, transporte, 
  amenidades, descripcion, deposito, contrato_minimo, disponible_desde, 
  latitud, longitud, imagen_principal, galeria, estado, propietario_nombre, propietario_telefono
) VALUES 
(
  1, 
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Habitación amoblada en apartaestudio', 
  'habitacion', 
  'Habitación', 
  420000, 
  'La Grama', 
  'Santo Tomás',
  'La Grama · 750m de Santo Tomás · 9 min a pie', 
  750, 
  '9 min', 
  3, 
  '14 m²', 
  'Ruta bus a 1 cuadra',
  ARRAY['Wifi', 'Amoblada', 'Baño privado'],
  'Excelente habitación privada dentro de un apartaestudio compartido enfocado exclusivamente en estudiantes. Cuenta con todos los servicios incluidos en el canon mensual (agua, luz, gas, internet de alta velocidad de 200 megas). Ubicada en un sector residencial muy seguro de La Grama, a pocos minutos caminando de la U. Santo Tomás y con acceso inmediato a transporte público hacia el centro de la ciudad.',
  '$420.000 (un mes)',
  '6 meses',
  'Inmediato',
  4.1535, 
  -73.6360,
  'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80',
  ARRAY[
    'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80'
  ],
  'disponible',
  'Marta Ruiz',
  '573108845612'
),
(
  2, 
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Apartaestudio moderno tipo loft', 
  'apartaestudio', 
  'Apartaestudio', 
  650000, 
  'El Barzal', 
  'Santo Tomás',
  'El Barzal · 1.2 km de Santo Tomás · 15 min a pie', 
  1200, 
  '15 min', 
  4, 
  '28 m²', 
  'A 3 cuadras y ciclorruta',
  ARRAY['Cocina integral', 'Wifi', 'Baño privado', 'Parqueadero'],
  'Apartaestudio independiente de ambiente exclusivo en El Barzal. Cuenta con acabados modernos, cocina integral, closet amplio, balcón con vista y acceso seguro con cerradura digital.',
  '$650.000 (un mes)',
  '6 meses',
  'Inmediato',
  4.1480, 
  -73.6310,
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80',
  ARRAY[
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80'
  ],
  'disponible',
  'Andrés Beltrán',
  '573123456789'
),
(
  3, 
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Habitación individual cerca al campus', 
  'habitacion', 
  'Habitación', 
  380000, 
  'La Grama', 
  'Santo Tomás',
  'La Grama · 500m de Santo Tomás · 6 min a pie', 
  500, 
  '6 min', 
  3, 
  '12 m²', 
  'Ruta universitaria directa',
  ARRAY['Wifi', 'Amoblada', 'Lavandería'],
  'Habitación cómoda para estudiante, ambiente silencioso ideal para estudiar, derecho a cocina y zona de ropas con lavadora.',
  '$380.000 (un mes)',
  '3 meses',
  'Inmediato',
  4.1560, 
  -73.6375,
  'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1000&q=80',
  ARRAY['https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1000&q=80'],
  'disponible',
  'Gladys Rodríguez',
  '573159988776'
),
(
  4, 
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Apartamento compartido de 2 alcobas', 
  'apartamento', 
  'Apartamento', 
  700000, 
  'San Benito', 
  'Santo Tomás',
  'San Benito · 900m de Santo Tomás · 11 min a pie', 
  900, 
  '11 min', 
  3, 
  '45 m²', 
  'Busetas continuas',
  ARRAY['2 Habitaciones', 'Cocina', 'Wifi', 'Bicicletero'],
  'Ideal para 2 compañeros que deseen compartir gastos. Espacioso, seguro, con sala comedor amplia y zona de estudio.',
  '$700.000 (un mes)',
  '6 meses',
  'Inmediato',
  4.1440, 
  -73.6390,
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1000&q=80',
  ARRAY['https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1000&q=80'],
  'disponible',
  'Carlos Julio Rincón',
  '573204445566'
)
ON CONFLICT (id) DO NOTHING;

-- Ajustar la secuencia de IDs de inmuebles
SELECT setval('inmuebles_id_seq', (SELECT MAX(id) FROM inmuebles));
