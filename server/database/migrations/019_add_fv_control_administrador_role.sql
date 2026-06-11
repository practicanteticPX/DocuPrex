-- Migration: Agregar rol obligatorio Control Administrativo para FV
-- Orden FV esperado:
-- 0 Negociador
-- 1 Control Administrativo
-- 2 Negociaciones
-- 3+ Responsables contables / Causacion

DO $$
DECLARE
  fv_type_id document_types.id%TYPE;
BEGIN
  SELECT id INTO fv_type_id
  FROM document_types
  WHERE code = 'FV'
  LIMIT 1;

  IF fv_type_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro el tipo de documento FV';
  END IF;

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
  ON CONFLICT (document_type_id, role_code)
  DO UPDATE SET
    role_name = EXCLUDED.role_name,
    order_position = EXCLUDED.order_position,
    is_required = TRUE,
    description = EXCLUDED.description;

  INSERT INTO document_type_roles (
    document_type_id,
    role_name,
    role_code,
    order_position,
    is_required,
    description
  ) VALUES (
    fv_type_id,
    'Control Administrativo',
    'CONTROL_ADMINISTRADOR',
    1,
    true,
    'Control administrativo obligatorio posterior al Negociador. Debe firmar Lina Gonzalez.'
  )
  ON CONFLICT (document_type_id, role_code)
  DO UPDATE SET
    role_name = EXCLUDED.role_name,
    order_position = EXCLUDED.order_position,
    is_required = TRUE,
    description = EXCLUDED.description;

  UPDATE document_type_roles
  SET order_position = CASE role_code
    WHEN 'NEGOCIADOR' THEN 0
    WHEN 'CONTROL_ADMINISTRADOR' THEN 1
    WHEN 'RESPONSABLE_NEGOCIACIONES' THEN 2
    WHEN 'RESPONSABLE_CENTRO_COSTOS' THEN 3
    WHEN 'RESPONSABLE_CUENTA_CONTABLE' THEN 4
    WHEN 'AREA_FINANCIERA' THEN 5
    WHEN 'CAUSACION' THEN 6
    WHEN 'CAUSACION_FINANCIERA' THEN 7
    WHEN 'CAUSACION_LOGISTICA' THEN 8
    ELSE order_position
  END
  WHERE document_type_id = fv_type_id
    AND role_code IN (
      'NEGOCIADOR',
      'CONTROL_ADMINISTRADOR',
      'RESPONSABLE_NEGOCIACIONES',
      'RESPONSABLE_CENTRO_COSTOS',
      'RESPONSABLE_CUENTA_CONTABLE',
      'AREA_FINANCIERA',
      'CAUSACION',
      'CAUSACION_FINANCIERA',
      'CAUSACION_LOGISTICA'
    );

  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE LOWER(TRIM(email)) = 'l.gonzalez@prexxa.com.co'
      AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RAISE NOTICE 'No se encontro Lina Gonzalez activa (l.gonzalez@prexxa.com.co). La logica backend fallara hasta que exista el usuario.';
  END IF;
END $$;

SELECT
  dt.code AS document_type_code,
  dtr.role_name,
  dtr.role_code,
  dtr.order_position,
  dtr.is_required
FROM document_type_roles dtr
JOIN document_types dt ON dt.id = dtr.document_type_id
WHERE dt.code = 'FV'
ORDER BY dtr.order_position, dtr.role_name;
