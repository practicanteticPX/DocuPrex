-- Migración: Agregar columna rejection_reason a la tabla signatures
-- Fecha: 2025-10-30

-- Agregar columna rejection_reason si no existe
ALTER TABLE signatures
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Comentario explicativo
COMMENT ON COLUMN signatures.rejection_reason IS 'Razón del rechazo cuando el status es rejected';
