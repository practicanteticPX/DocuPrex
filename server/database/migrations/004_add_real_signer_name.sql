-- Migration: Add real_signer_name column to signatures table
-- Purpose: Store the actual person's name when using shared accounts like "Negociaciones"
-- Date: 2025-01-22

-- Add real_signer_name column to signatures table
ALTER TABLE signatures
ADD COLUMN IF NOT EXISTS real_signer_name VARCHAR(255);

-- Add comment to column for documentation
COMMENT ON COLUMN signatures.real_signer_name IS 'Stores the real person name when using shared accounts (e.g., "Carolina Martinez" when signed by Negociaciones user)';
