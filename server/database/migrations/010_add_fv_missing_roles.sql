-- ============================================================
-- Migration: Agregar roles faltantes para tipo de documento FV
-- ============================================================
-- Descripción:
-- Agrega los roles que se usan en el flujo de facturas pero no
-- estaban definidos en document_type_roles:
--   1. Negociador
--   2. Causación Financiera
--   3. Causación Logística
-- ============================================================

-- Obtener el ID del tipo de documento FV
DO $$
DECLARE
  fv_type_id INTEGER;
BEGIN
  SELECT id INTO fv_type_id FROM document_types WHERE code = 'FV';

  IF fv_type_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el tipo de documento FV';
  END IF;

  -- 1. Agregar rol Negociador (primera posición)
  INSERT INTO document_type_roles (
    document_type_id,
    role_name,
    role_code,
    order_position,
    is_required,
    description
  ) VALUES (
    fv_type_id,
    'Negociador',
    'NEGOCIADOR',
    0,
    true,
    'Persona que negocia y sube el documento de factura'
  )
  ON CONFLICT (document_type_id, role_code) DO NOTHING;

  -- 2. Agregar Causación Financiera
  INSERT INTO document_type_roles (
    document_type_id,
    role_name,
    role_code,
    order_position,
    is_required,
    description
  ) VALUES (
    fv_type_id,
    'Causación Financiera',
    'CAUSACION_FINANCIERA',
    6,
    false,
    'Grupo de causación del área financiera'
  )
  ON CONFLICT (document_type_id, role_code) DO NOTHING;

  -- 3. Agregar Causación Logística
  INSERT INTO document_type_roles (
    document_type_id,
    role_name,
    role_code,
    order_position,
    is_required,
    description
  ) VALUES (
    fv_type_id,
    'Causación Logística',
    'CAUSACION_LOGISTICA',
    7,
    false,
    'Grupo de causación del área logística'
  )
  ON CONFLICT (document_type_id, role_code) DO NOTHING;

  RAISE NOTICE 'Roles agregados exitosamente para FV';
END $$;

-- Verificar roles creados
SELECT
  dt.code as tipo_doc,
  dtr.role_name,
  dtr.role_code,
  dtr.order_position
FROM document_type_roles dtr
JOIN document_types dt ON dtr.document_type_id = dt.id
WHERE dt.code = 'FV'
ORDER BY dtr.order_position;
