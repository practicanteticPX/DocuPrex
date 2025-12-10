-- Migration 003: Agregar columna metadata a tabla documents
-- Fecha: 2025-01-14
-- Descripción:
--   Agrega columna metadata (JSONB) para almacenar datos adicionales del template
--   de facturas y otros documentos que requieran información estructurada

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING GIN (metadata);

COMMENT ON COLUMN documents.metadata IS 'Datos adicionales en formato JSON para templates de documentos (ej: datos de plantilla de factura)';
