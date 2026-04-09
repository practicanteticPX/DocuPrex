-- Migration: Agregar soporte para retenciones y grupos de causación
-- Fecha: 2026-04-08
-- Descripción: Actualiza la tabla documents con retention_data y backup, crea tablas de causación

-- ==================================================
-- 1. Agregar columnas faltantes a documents
-- ==================================================
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS retention_data JSONB DEFAULT '[]'::JSONB;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS original_pdf_backup VARCHAR(1000);

-- Crear índice para búsquedas en retention_data
CREATE INDEX IF NOT EXISTS idx_documents_retention_data ON documents USING GIN(retention_data);

-- ==================================================
-- 2. Crear tablas de causación si no existen
-- ==================================================
CREATE TABLE IF NOT EXISTS causacion_grupos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS causacion_integrantes (
  id SERIAL PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES causacion_grupos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cargo VARCHAR(255) DEFAULT 'Causación',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(grupo_id, user_id)
);

-- Crear índices para causacion_grupos
CREATE INDEX IF NOT EXISTS idx_causacion_grupos_codigo ON causacion_grupos(codigo);
CREATE INDEX IF NOT EXISTS idx_causacion_grupos_activo ON causacion_grupos(activo);

-- Crear índices para causacion_integrantes
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_grupo ON causacion_integrantes(grupo_id);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_user ON causacion_integrantes(user_id);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_activo ON causacion_integrantes(activo);

-- Insertar datos iniciales
INSERT INTO causacion_grupos (codigo, nombre, descripcion) VALUES
  ('financiera', 'Financiera', 'Grupo de causación del área financiera'),
  ('logistica', 'Logística', 'Grupo de causación del área de logística')
ON CONFLICT (codigo) DO NOTHING;

-- ==================================================
-- 3. Verificar que document_signers tenga campos de causación
-- ==================================================
-- Estos campos pueden haber sido agregados previamente

-- ==================================================
-- 4. Comentarios
-- ==================================================
COMMENT ON COLUMN documents.retention_data IS 'JSONB array de retenciones activas: [{userId, activa, motivo, fecha}]';
COMMENT ON COLUMN documents.original_pdf_backup IS 'Ruta de backup del PDF original antes de cambios';
COMMENT ON TABLE causacion_grupos IS 'Grupos disponibles para causación de facturas';
COMMENT ON TABLE causacion_integrantes IS 'Integrantes de cada grupo de causación (referencia a users)';
COMMENT ON COLUMN causacion_grupos.codigo IS 'Código único del grupo (financiera, logistica)';
COMMENT ON COLUMN causacion_integrantes.cargo IS 'Cargo del integrante en el grupo';
