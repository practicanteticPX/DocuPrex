-- Migration 003: Agregar campo consecutivo a signatures
-- Fecha: 2025-01-13
-- Descripción: Agregar campo "consecutivo" para Legalización de Facturas (FV)

-- Agregar columna consecutivo (opcional, TEXT)
ALTER TABLE signatures
ADD COLUMN IF NOT EXISTS consecutivo TEXT;

-- Verificar que la columna fue agregada
SELECT
  'Campo agregado:' as resultado,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'signatures'
  AND column_name = 'consecutivo';
