-- ============================================================================
-- ROUMIX - ESQUEMA ACTUAL DE LA BASE DE DATOS (POSTGRESQL / SUPABASE)
-- Asignatura: Construcción de Software - Semestre 4
-- Universidad Santo Tomás Villavicencio
--
-- Este archivo es la FOTO del esquema resultante de aplicar database/migrations.
-- Sirve como referencia. Para crear o actualizar la base de datos use:
--     cd backend && npm run migrate
-- Si cambia el esquema, cree una nueva migración y actualice este archivo.
-- ============================================================================

-- 1. USUARIOS (perfil de cada cuenta de Supabase Auth)
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('estudiante', 'propietario')),
  telefono VARCHAR(30),
  universidad VARCHAR(100) DEFAULT 'Santo Tomás',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. INMUEBLES (cada uno pertenece a un perfil con rol propietario)
CREATE TABLE inmuebles (
  id SERIAL PRIMARY KEY,
  propietario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE, -- NULL solo en datos de demostración
  titulo VARCHAR(200) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('habitacion', 'apartaestudio', 'apartamento')),
  tipo_label VARCHAR(50),
  precio INTEGER NOT NULL CHECK (precio > 0),
  barrio VARCHAR(100) NOT NULL,
  universidad VARCHAR(100) NOT NULL DEFAULT 'Santo Tomás',
  distancia_texto VARCHAR(150),
  distancia_metros INTEGER,
  tiempo_pie VARCHAR(50),
  estrato INTEGER CHECK (estrato BETWEEN 1 AND 6),
  area VARCHAR(30),
  transporte VARCHAR(150),
  amenidades TEXT[] NOT NULL DEFAULT '{}',
  descripcion TEXT,
  deposito VARCHAR(100),
  contrato_minimo VARCHAR(50),
  disponible_desde VARCHAR(50) DEFAULT 'Inmediato',
  latitud NUMERIC(10, 6),
  longitud NUMERIC(10, 6),
  imagen_principal TEXT,
  galeria TEXT[] NOT NULL DEFAULT '{}' CONSTRAINT inmuebles_galeria_max CHECK (cardinality(galeria) <= 10),
  estado VARCHAR(20) NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible', 'pausado', 'arrendado')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. ÍNDICES
CREATE INDEX idx_inmuebles_precio ON inmuebles(precio);
CREATE INDEX idx_inmuebles_tipo ON inmuebles(tipo);
CREATE INDEX idx_inmuebles_universidad ON inmuebles(universidad);
CREATE INDEX idx_inmuebles_estado ON inmuebles(estado);
CREATE INDEX idx_inmuebles_propietario ON inmuebles(propietario_id);

-- 4. TRIGGERS
--   trg_usuarios_updated_at / trg_inmuebles_updated_at -> actualizar_updated_at()
--   on_auth_user_created (auth.users) -> crear_perfil_usuario()
--   Ver database/migrations/002_perfiles_auth_y_restricciones.sql

-- 5. SEGURIDAD
--   RLS activado en usuarios e inmuebles sin políticas: solo el backend accede.

-- 6. STORAGE
--   Bucket público 'inmuebles' (jpeg, png, webp; máx. 5 MB por archivo).

-- 7. CONTROL DE MIGRACIONES
CREATE TABLE schema_migrations (
  nombre TEXT PRIMARY KEY,
  aplicada_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
