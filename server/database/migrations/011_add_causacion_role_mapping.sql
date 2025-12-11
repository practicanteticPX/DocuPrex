-- ============================================================
-- Migration: Mapeo dinámico entre grupos de causación y roles
-- ============================================================
-- Descripción:
-- Agrega un campo role_code a causacion_grupos para mapear
-- dinámicamente cada grupo a su rol correspondiente.
-- Esto permite agregar nuevos grupos sin tocar código.
-- ============================================================

-- Agregar campo role_code a causacion_grupos
ALTER TABLE causacion_grupos
ADD COLUMN IF NOT EXISTS role_code VARCHAR(50);

-- Actualizar grupos existentes con sus role_codes
UPDATE causacion_grupos
SET role_code = 'CAUSACION_FINANCIERA'
WHERE codigo = 'financiera';

UPDATE causacion_grupos
SET role_code = 'CAUSACION_LOGISTICA'
WHERE codigo = 'logistica';

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_causacion_grupos_role_code
ON causacion_grupos (role_code)
WHERE role_code IS NOT NULL;

COMMENT ON COLUMN causacion_grupos.role_code IS 'Código del rol asociado a este grupo de causación (ej: CAUSACION_FINANCIERA). Debe coincidir con un role_code en document_type_roles para el tipo de documento FV.';

-- Verificar resultado
SELECT
  cg.codigo as grupo_codigo,
  cg.nombre as grupo_nombre,
  cg.role_code,
  dtr.role_name as rol_nombre
FROM causacion_grupos cg
LEFT JOIN document_type_roles dtr ON cg.role_code = dtr.role_code
ORDER BY cg.id;
