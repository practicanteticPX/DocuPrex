-- Migration: Add consecutivo column to documents table
-- Date: 2025-12-09
-- Purpose: Store the invoice consecutivo (numero_control) in FV documents

-- Add consecutivo column
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS consecutivo VARCHAR(100);

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_documents_consecutivo
ON documents(consecutivo)
WHERE consecutivo IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN documents.consecutivo IS 'Invoice consecutivo (numero_control) for FV (Legalización de Facturas) documents';
