-- Migration 004: Agregar columna consecutivo a tabla documents
-- Fecha: 2025-01-14
-- Descripción:
--   Agrega columna consecutivo (VARCHAR) para almacenar números de control
--   de facturas y otros documentos que requieran identificación externa

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS consecutivo VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_documents_consecutivo ON documents(consecutivo);

COMMENT ON COLUMN documents.consecutivo IS 'Número de control o consecutivo externo (ej: número de factura en SERV_QPREX)';
