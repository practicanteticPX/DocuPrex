-- Restaurar tipo de documento "Legalización de Facturas" (FV) con INTEGER IDs
-- Fecha: 2025-12-06

-- ========================================
-- PASO 1: Insertar tipo de documento "Legalización de Facturas"
-- ========================================

INSERT INTO document_types (
  name,
  code,
  prefix,
  description,
  is_active,
  created_at,
  updated_at
) VALUES (
  'Legalización de Facturas',
  'FV',
  'FV - ',
  'Legalización de facturas con flujo de aprobación flexible y múltiples roles por firmante',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (code) DO NOTHING
RETURNING id;

-- ========================================
-- PASO 2: Crear roles para "Legalización de Facturas"
-- ========================================

DO $$
DECLARE
  fv_doc_type_id INTEGER;
BEGIN
  -- Obtener el ID del tipo de documento FV
  SELECT id INTO fv_doc_type_id
  FROM document_types
  WHERE code = 'FV';

  -- Si se encontró el tipo de documento, insertar los roles
  IF fv_doc_type_id IS NOT NULL THEN

    -- Rol 1: Responsable centro de costos
    INSERT INTO document_type_roles (
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      fv_doc_type_id,
      'Responsable centro de costos',
      'RESPONSABLE_CENTRO_COSTOS',
      1,
      false,
      'Responsable del centro de costos asociado a la factura',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    -- Rol 2: Responsable cuenta contable
    INSERT INTO document_type_roles (
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      fv_doc_type_id,
      'Responsable cuenta contable',
      'RESPONSABLE_CUENTA_CONTABLE',
      2,
      false,
      'Responsable de la cuenta contable donde se imputa la factura',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    -- Rol 3: Responsable negociaciones
    INSERT INTO document_type_roles (
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      fv_doc_type_id,
      'Responsable negociaciones',
      'RESPONSABLE_NEGOCIACIONES',
      3,
      false,
      'Responsable del área de negociaciones',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    -- Rol 4: Área financiera
    INSERT INTO document_type_roles (
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      fv_doc_type_id,
      'Área financiera',
      'AREA_FINANCIERA',
      4,
      false,
      'Representante del área financiera',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    -- Rol 5: Causación
    INSERT INTO document_type_roles (
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description,
      created_at
    ) VALUES (
      fv_doc_type_id,
      'Causación',
      'CAUSACION',
      5,
      false,
      'Responsable de la causación de la factura',
      CURRENT_TIMESTAMP
    ) ON CONFLICT (document_type_id, role_code) DO NOTHING;

    RAISE NOTICE 'Tipo de documento "Legalización de Facturas" y sus 5 roles creados exitosamente';
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
  id,
  name,
  code,
  prefix,
  is_active
FROM document_types
WHERE code = 'FV';

-- Verificar que los roles fueron creados
SELECT
  'Roles FV:' as tipo,
  dtr.id,
  dtr.role_name,
  dtr.role_code,
  dtr.order_position,
  dtr.is_required
FROM document_type_roles dtr
JOIN document_types dt ON dtr.document_type_id = dt.id
WHERE dt.code = 'FV'
ORDER BY dtr.order_position;
