-- ============================================================================
-- ROUMIX - ESQUEMA DE BASE DE DATOS RELACIONAL (POSTGRESQL / SUPABASE)
-- Asignatura: Construcción de Software - Semestre 4
-- Universidad Santo Tomás Villavicencio
-- ============================================================================

-- Habilitar extensión para UUIDs si no está habilitada
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABLA: USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('estudiante', 'propietario')),
  telefono VARCHAR(30),
  universidad VARCHAR(100) DEFAULT 'Santo Tomás',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA: INMUEBLES
CREATE TABLE IF NOT EXISTS inmuebles (
  id SERIAL PRIMARY KEY,
  propietario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
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
  amenidades TEXT[] DEFAULT '{}',
  descripcion TEXT,
  deposito VARCHAR(100),
  contrato_minimo VARCHAR(50),
  disponible_desde VARCHAR(50) DEFAULT 'Inmediato',
  latitud NUMERIC(10, 6),
  longitud NUMERIC(10, 6),
  imagen_principal TEXT,
  galeria TEXT[] DEFAULT '{}',
  estado VARCHAR(20) DEFAULT 'disponible' CHECK (estado IN ('disponible', 'pausado', 'arrendado')),
  propietario_nombre VARCHAR(120),
  propietario_telefono VARCHAR(30),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. ÍNDICES PARA OPTIMIZAR BÚSQUEDAS FRECUENTES
CREATE INDEX IF NOT EXISTS idx_inmuebles_precio ON inmuebles(precio);
CREATE INDEX IF NOT EXISTS idx_inmuebles_tipo ON inmuebles(tipo);
CREATE INDEX IF NOT EXISTS idx_inmuebles_universidad ON inmuebles(universidad);
CREATE INDEX IF NOT EXISTS idx_inmuebles_estado ON inmuebles(estado);
