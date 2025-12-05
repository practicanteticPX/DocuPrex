-- Migration: Crear tablas para grupos de causación y sus integrantes
-- Fecha: 2025-12-05
-- Descripción: Permite asignar facturas a grupos de causación (Financiera o Logística)
--              Las personas del grupo seleccionado recibirán notificación para firmar

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
-- ==================================================
CREATE TABLE IF NOT EXISTS causacion_integrantes (
  id SERIAL PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES causacion_grupos(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  cargo VARCHAR(255) DEFAULT 'Causación',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Un integrante no puede estar duplicado en el mismo grupo
  UNIQUE(grupo_id, email)
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_causacion_grupos_codigo ON causacion_grupos(codigo);
CREATE INDEX IF NOT EXISTS idx_causacion_grupos_activo ON causacion_grupos(activo);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_grupo ON causacion_integrantes(grupo_id);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_email ON causacion_integrantes(email);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_activo ON causacion_integrantes(activo);

-- Insertar los grupos iniciales
INSERT INTO causacion_grupos (codigo, nombre, descripcion) VALUES
  ('financiera', 'Financiera', 'Grupo de causación del área financiera'),
  ('logistica', 'Logística', 'Grupo de causación del área de logística')
ON CONFLICT (codigo) DO NOTHING;

-- Comentarios en las tablas
COMMENT ON TABLE causacion_grupos IS 'Grupos disponibles para el proceso de causación de facturas';
COMMENT ON TABLE causacion_integrantes IS 'Integrantes de cada grupo de causación que recibirán notificaciones para firmar';
COMMENT ON COLUMN causacion_grupos.codigo IS 'Código único del grupo usado en el frontend (financiera, logistica)';
COMMENT ON COLUMN causacion_integrantes.cargo IS 'Cargo que aparecerá en el informe de firmas (por defecto: Causación)';
