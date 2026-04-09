-- Migration: Agregar soporte para grupos de causación en document_signers
-- Fecha: 2026-04-08
-- Descripción: Agrega campos para soportar firmantes que son grupos de causación

ALTER TABLE document_signers
ADD COLUMN IF NOT EXISTS is_causacion_group BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS grupo_codigo VARCHAR(50),
ADD COLUMN IF NOT EXISTS assigned_role_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS role_names TEXT[] DEFAULT '{}';

-- Crear índice para búsquedas por grupo
CREATE INDEX IF NOT EXISTS idx_document_signers_grupo_codigo ON document_signers(grupo_codigo);
CREATE INDEX IF NOT EXISTS idx_document_signers_is_causacion ON document_signers(is_causacion_group);

COMMENT ON COLUMN document_signers.is_causacion_group IS 'true si el firmante es un grupo de causación, false si es un usuario individual';
COMMENT ON COLUMN document_signers.grupo_codigo IS 'Código del grupo de causación (ej: financiera, logistica)';
COMMENT ON COLUMN document_signers.assigned_role_ids IS 'Array de IDs de roles asignados';
COMMENT ON COLUMN document_signers.role_names IS 'Array de nombres de roles para histórico';
