/**
 * Especificação DDL de referência para a futura migração da camada de persistência
 * do AGROLYNX para PostgreSQL + PostGIS.
 * Nenhuma conexão ativa é aberta nesta versão inicial de interface.
 */
export const POSTGRES_BLUEPRINT_SQL = `-- AGROLYNX — Blueprint PostgreSQL 16 + PostGIS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(160) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  organization VARCHAR(180) NOT NULL,
  role VARCHAR(40) NOT NULL CHECK (role IN ('produtor', 'agronomo', 'gestor')),
  region VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  municipality VARCHAR(120) NOT NULL,
  state CHAR(2) NOT NULL,
  total_area_ha NUMERIC(10, 2) NOT NULL CHECK (total_area_ha > 0),
  centroid GEOGRAPHY(POINT, 4326) NOT NULL,
  biome VARCHAR(80) NOT NULL,
  car_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE field_plots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  area_ha NUMERIC(10, 2) NOT NULL CHECK (area_ha > 0),
  soil_texture_class VARCHAR(80),
  elevation_m NUMERIC(7, 2),
  geometry GEOGRAPHY(POLYGON, 4326) NOT NULL,
  irrigation_system VARCHAR(40) NOT NULL
);

CREATE TABLE crop_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plot_id UUID NOT NULL REFERENCES field_plots(id) ON DELETE CASCADE,
  crop_name VARCHAR(100) NOT NULL,
  cultivar VARCHAR(120) NOT NULL,
  season VARCHAR(20) NOT NULL,
  planting_date DATE NOT NULL,
  expected_harvest_date DATE NOT NULL,
  stage VARCHAR(40) NOT NULL,
  target_kc NUMERIC(4, 2) NOT NULL
);

CREATE TABLE soil_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plot_id UUID NOT NULL REFERENCES field_plots(id) ON DELETE CASCADE,
  collected_at DATE NOT NULL,
  depth_label VARCHAR(20) NOT NULL,
  ph_h2o NUMERIC(4, 2) NOT NULL,
  clay_percent NUMERIC(5, 2) NOT NULL,
  silt_percent NUMERIC(5, 2) NOT NULL,
  sand_percent NUMERIC(5, 2) NOT NULL,
  organic_carbon_g_kg NUMERIC(6, 2) NOT NULL,
  source VARCHAR(40) NOT NULL
);

CREATE TABLE nasa_telemetry_cache (
  id BIGSERIAL PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  variable_code VARCHAR(60) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  numeric_value DOUBLE PRECISION NOT NULL,
  unit VARCHAR(30) NOT NULL,
  raw_metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_telemetry_lookup
  ON nasa_telemetry_cache (property_id, provider, variable_code, observed_at DESC);`;
