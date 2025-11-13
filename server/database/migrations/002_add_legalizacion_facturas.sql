-- Migration 002: Agregar tipo de documento "Legalización de Facturas" con soporte para múltiples roles
-- Fecha: 2025-01-13
-- Descripción:
--   1. Agrega nuevo tipo de documento "Legalización de Facturas" (FV)
--   2. Modifica tabla document_signers para soportar múltiples roles por firmante (arrays)
--   3. Agrega 5 roles para el tipo FV (no obligatorios)

-- ========================================
-- PASO 1: Modificar tabla document_signers para soportar arrays de roles
-- ========================================

-- Agregar nuevas columnas de arrays (inicialmente NULL)
ALTER TABLE document_signers
ADD COLUMN IF NOT EXISTS assigned_role_ids UUID[],
ADD COLUMN IF NOT EXISTS role_names TEXT[];

-- Migrar datos existentes de columnas singulares a arrays
UPDATE document_signers
SET
  assigned_role_ids = CASE
    WHEN assigned_role_id IS NOT NULL THEN ARRAY[assigned_role_id]
    ELSE ARRAY[]::UUID[]
  END,
  role_names = CASE
    WHEN role_name IS NOT NULL THEN ARRAY[role_name]
    ELSE ARRAY[]::TEXT[]
  END
WHERE assigned_role_ids IS NULL OR role_names IS NULL;

-- Establecer valores por defecto para arrays vacíos
ALTER TABLE document_signers
ALTER COLUMN assigned_role_ids SET DEFAULT ARRAY[]::UUID[],
ALTER COLUMN role_names SET DEFAULT ARRAY[]::TEXT[];

-- Hacer las columnas NOT NULL ahora que tienen valores
ALTER TABLE document_signers
ALTER COLUMN assigned_role_ids SET NOT NULL,
ALTER COLUMN role_names SET NOT NULL;

-- Nota: Mantenemos las columnas antiguas por compatibilidad hacia atrás
-- assigned_role_id y role_name permanecen pero eventualmente pueden eliminarse

-- ========================================
-- PASO 2: Insertar nuevo tipo de documento "Legalización de Facturas"
-- ========================================

INSERT INTO document_types (
  id,
  name,
  code,
  prefix,
  description,
  is_active,
  created_at,
  updated_at
) VALUES (
  uuid_generate_v4(),
  'Legalización de Facturas',
  'FV',
  'FV - ',
  'Legalización de facturas con flujo de aprobación flexible y múltiples roles por firmante',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (code) DO NOTHING;

-- ========================================
-- PASO 3: Crear roles para "Legalización de Facturas"
-- ========================================

DO $$
DECLARE
  fv_doc_type_id UUID;
BEGIN
  -- Obtener el ID del tipo de documento FV
  SELECT id INTO fv_doc_type_id
  FROM document_types
  WHERE code = 'FV';

  -- Si se encontró el tipo de documento, insertar los roles
  IF fv_doc_type_id IS NOT NULL THEN

    -- Rol 1: Responsable centro de costos
    INSERT INTO document_type_roles (
      id,
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      uuid_generate_v4(),
      fv_doc_type_id,
      'Responsable centro de costos',
      'RESPONSABLE_CENTRO_COSTOS',
      1,
      false, -- No obligatorio
      'Responsable del centro de costos asociado a la factura',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    -- Rol 2: Responsable cuenta contable
    INSERT INTO document_type_roles (
      id,
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      uuid_generate_v4(),
      fv_doc_type_id,
      'Responsable cuenta contable',
      'RESPONSABLE_CUENTA_CONTABLE',
      2,
      false, -- No obligatorio
      'Responsable de la cuenta contable donde se imputa la factura',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    -- Rol 3: Responsable negociaciones
    INSERT INTO document_type_roles (
      id,
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      uuid_generate_v4(),
      fv_doc_type_id,
      'Responsable negociaciones',
      'RESPONSABLE_NEGOCIACIONES',
      3,
      false, -- No obligatorio
      'Responsable del área de negociaciones',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    -- Rol 4: Área financiera
    INSERT INTO document_type_roles (
      id,
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      uuid_generate_v4(),
      fv_doc_type_id,
      'Área financiera',
      'AREA_FINANCIERA',
      4,
      false, -- No obligatorio
      'Representante del área financiera',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    -- Rol 5: Causación
    INSERT INTO document_type_roles (
      id,
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      uuid_generate_v4(),
      fv_doc_type_id,
      'Causación',
      'CAUSACION',
      5,
      false, -- No obligatorio
      'Responsable de la causación de la factura',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    RAISE NOTICE 'Tipo de documento "Legalización de Facturas" y sus roles creados exitosamente';
  ELSE
    RAISE NOTICE 'No se pudo encontrar el tipo de documento FV';
  END IF;
END $$;

-- ========================================
-- VERIFICACIÓN
-- ========================================

-- Verificar que el tipo de documento fue creado
SELECT
  'Tipo de Documento:' as tipo,
  name,
  code,
  prefix,
  is_active
FROM document_types
WHERE code = 'FV';

-- Verificar que los roles fueron creados
SELECT
  'Roles FV:' as tipo,
  dtr.role_name,
  dtr.role_code,
  dtr.order_position,
  dtr.is_required
FROM document_type_roles dtr
JOIN document_types dt ON dtr.document_type_id = dt.id
WHERE dt.code = 'FV'
ORDER BY dtr.order_position;

-- Verificar estructura de document_signers
SELECT
  'Columnas document_signers:' as tipo,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'document_signers'
  AND column_name IN ('assigned_role_id', 'role_name', 'assigned_role_ids', 'role_names')
ORDER BY column_name;
