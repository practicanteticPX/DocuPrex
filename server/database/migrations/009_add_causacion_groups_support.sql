-- ============================================================
-- Migration: Soporte para Grupos de Causación en document_signers
-- ============================================================
-- Descripción:
-- Modifica la tabla document_signers para permitir firmantes que NO son
-- usuarios específicos (user_id NULL) sino grupos de causación donde
-- cualquier miembro del grupo puede firmar.
--
-- Cambios:
-- 1. Permitir user_id = NULL
-- 2. Agregar campo is_causacion_group para identificar grupos
-- 3. Agregar campo grupo_codigo para almacenar el código del grupo
-- 4. Modificar restricción UNIQUE para permitir un solo grupo por documento
-- ============================================================

-- Paso 1: Eliminar la restricción de foreign key actual
ALTER TABLE document_signers
DROP CONSTRAINT IF EXISTS document_signers_user_id_fkey;

-- Paso 2: Permitir user_id NULL
ALTER TABLE document_signers
ALTER COLUMN user_id DROP NOT NULL;

-- Paso 3: Agregar columnas para grupos de causación
ALTER TABLE document_signers
ADD COLUMN IF NOT EXISTS is_causacion_group BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE document_signers
ADD COLUMN IF NOT EXISTS grupo_codigo VARCHAR(50);

-- Paso 4: Recrear foreign key permitiendo NULL
ALTER TABLE document_signers
ADD CONSTRAINT document_signers_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Paso 5: Eliminar la restricción UNIQUE actual (document_id, user_id)
ALTER TABLE document_signers
DROP CONSTRAINT IF EXISTS document_signers_document_id_user_id_key;

-- Paso 6: Crear nueva restricción UNIQUE parcial
-- Solo aplica cuando NO es grupo de causación (permite user_id = NULL para grupos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_signers_unique_user
ON document_signers (document_id, user_id)
WHERE user_id IS NOT NULL;

-- Paso 7: Crear restricción UNIQUE para grupos de causación
-- Solo puede haber UN grupo de causación del mismo código por documento
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_signers_unique_group
ON document_signers (document_id, grupo_codigo)
WHERE is_causacion_group = TRUE AND grupo_codigo IS NOT NULL;

-- Paso 8: Agregar índice para mejorar búsquedas por grupo
CREATE INDEX IF NOT EXISTS idx_document_signers_grupo_codigo
ON document_signers (grupo_codigo)
WHERE grupo_codigo IS NOT NULL;

-- Paso 9: Agregar CHECK constraint para validar datos
ALTER TABLE document_signers
ADD CONSTRAINT check_causacion_group_data
CHECK (
  (is_causacion_group = FALSE AND user_id IS NOT NULL AND grupo_codigo IS NULL)
  OR
  (is_causacion_group = TRUE AND user_id IS NULL AND grupo_codigo IS NOT NULL)
);

COMMENT ON COLUMN document_signers.is_causacion_group IS 'Indica si este firmante es un grupo de causación (no un usuario específico)';
COMMENT ON COLUMN document_signers.grupo_codigo IS 'Código del grupo de causación (ej: "financiera", "logistica"). NULL si no es un grupo.';
