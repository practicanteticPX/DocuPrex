-- Agregar campos para sistema de retención de documentos
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS retention_data JSONB DEFAULT '[]'::jsonb;

-- retention_data estructura:
-- [
--   {
--     "userId": "uuid",
--     "userName": "string",
--     "centroCostoIndex": number,
--     "motivo": "string",
--     "porcentajeRetenido": number,
--     "fechaRetencion": "ISO timestamp",
--     "activa": boolean
--   }
-- ]

-- Índice para consultas rápidas de documentos retenidos
CREATE INDEX IF NOT EXISTS idx_documents_retention
ON documents USING GIN (retention_data);

COMMENT ON COLUMN documents.retention_data IS 'Array JSON con retenciones por centro de costo';
