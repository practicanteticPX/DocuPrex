-- Migration: Add original_pdf_backup column to documents table
-- Purpose: Store backup of original PDF files before they are merged with templates
--          This allows clean editing of documents by using the original PDF instead
--          of extracting it from the merged document
-- Created: 2025-12-12

-- Add column to store path to original PDF backup
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS original_pdf_backup VARCHAR(1000);

-- Add index for performance when querying documents with backups
CREATE INDEX IF NOT EXISTS idx_documents_original_pdf_backup
ON documents(original_pdf_backup) WHERE original_pdf_backup IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN documents.original_pdf_backup IS
'Path to backup of original PDF file before merging with template. Used for editing documents. Deleted when document is signed by someone other than creator.';
