-- Migration: Crear tablas para grupos de causación y sus integrantes (Versión 2)
-- Fecha: 2025-12-05
-- Descripción: Permite asignar facturas a grupos de causación (Financiera o Logística)
--              Los integrantes se referencian directamente desde la tabla users

-- ==================================================
-- ELIMINAR TABLAS ANTERIORES SI EXISTEN
-- ==================================================
DROP TABLE IF EXISTS causacion_integrantes CASCADE;
DROP TABLE IF EXISTS causacion_grupos CASCADE;

-- ==================================================
-- TABLA: causacion_grupos
-- Define los grupos disponibles para causación
-- ==================================================
CREATE TABLE IF NOT EXISTS causacion_grupos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE, -- 'financiera' o 'logistica'
  nombre VARCHAR(255) NOT NULL, -- 'Financiera' o 'Logística'
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================================================
-- TABLA: causacion_integrantes
-- Define los integrantes de cada grupo de causación
-- Referencia directamente a la tabla users
-- ==================================================
CREATE TABLE IF NOT EXISTS causacion_integrantes (
  id SERIAL PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES causacion_grupos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cargo VARCHAR(255) DEFAULT 'Causación',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Un usuario no puede estar duplicado en el mismo grupo
  UNIQUE(grupo_id, user_id)
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_causacion_grupos_codigo ON causacion_grupos(codigo);
CREATE INDEX IF NOT EXISTS idx_causacion_grupos_activo ON causacion_grupos(activo);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_grupo ON causacion_integrantes(grupo_id);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_user ON causacion_integrantes(user_id);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_activo ON causacion_integrantes(activo);

-- Insertar los grupos iniciales
INSERT INTO causacion_grupos (codigo, nombre, descripcion) VALUES
  ('financiera', 'Financiera', 'Grupo de causación del área financiera'),
  ('logistica', 'Logística', 'Grupo de causación del área de logística')
ON CONFLICT (codigo) DO NOTHING;

-- Comentarios en las tablas
COMMENT ON TABLE causacion_grupos IS 'Grupos disponibles para el proceso de causación de facturas';
COMMENT ON TABLE causacion_integrantes IS 'Integrantes de cada grupo de causación (referencia directa a users)';
COMMENT ON COLUMN causacion_grupos.codigo IS 'Código único del grupo usado en el frontend (financiera, logistica)';
COMMENT ON COLUMN causacion_integrantes.user_id IS 'Referencia al usuario en la tabla users (nombre y email se obtienen de ahí)';
COMMENT ON COLUMN causacion_integrantes.cargo IS 'Cargo que aparecerá en el informe de firmas (por defecto: Causación)';
