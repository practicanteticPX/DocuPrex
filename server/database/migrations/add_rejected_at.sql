-- Migración: Agregar columna rejected_at a la tabla signatures
-- Fecha: 2025-10-30

-- Agregar columna rejected_at
ALTER TABLE signatures
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

-- Comentario explicativo
COMMENT ON COLUMN signatures.rejected_at IS 'Fecha y hora en que se rechazó la firma';

-- Índice para optimizar consultas de documentos rechazados
CREATE INDEX IF NOT EXISTS idx_signatures_rejected
ON signatures(signer_id, status)
WHERE status = 'rejected';

CREATE INDEX IF NOT EXISTS idx_signatures_rejected_documents
ON signatures(document_id, status)
WHERE status = 'rejected';
