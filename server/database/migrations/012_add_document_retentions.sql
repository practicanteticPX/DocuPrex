-- ============================================================
-- Migration: Sistema de retención de facturas
-- ============================================================
-- Descripción:
-- Agrega tabla para gestionar retenciones de facturas FV.
-- Solo el responsable del centro de costos puede retener y
-- liberar facturas indicando porcentaje y razón.
-- ============================================================

-- Crear tabla de retenciones
CREATE TABLE IF NOT EXISTS document_retentions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  retained_by INTEGER NOT NULL REFERENCES users(id),
  retention_percentage INTEGER NOT NULL CHECK (retention_percentage >= 1 AND retention_percentage <= 100),
  retention_reason TEXT NOT NULL,
  retained_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,
  released_by INTEGER REFERENCES users(id),
  CONSTRAINT unique_active_retention UNIQUE (document_id, released_at)
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_document_retentions_document_id
ON document_retentions (document_id);

CREATE INDEX IF NOT EXISTS idx_document_retentions_retained_by
ON document_retentions (retained_by);

CREATE INDEX IF NOT EXISTS idx_document_retentions_active
ON document_retentions (document_id)
WHERE released_at IS NULL;

-- Comentarios descriptivos
COMMENT ON TABLE document_retentions IS 'Almacena retenciones de facturas FV realizadas por responsables de centro de costos';
COMMENT ON COLUMN document_retentions.retention_percentage IS 'Porcentaje de retención (1-100%)';
COMMENT ON COLUMN document_retentions.retention_reason IS 'Razón o descripción de por qué se retiene la factura';
COMMENT ON COLUMN document_retentions.retained_at IS 'Timestamp cuando se realizó la retención';
COMMENT ON COLUMN document_retentions.released_at IS 'Timestamp cuando se liberó la retención (NULL si aún está retenida)';
COMMENT ON COLUMN document_retentions.released_by IS 'Usuario que liberó la retención (debe ser el mismo que retuvo)';

-- Verificar resultado
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'document_retentions'
ORDER BY ordinal_position;
