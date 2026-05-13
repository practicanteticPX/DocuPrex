-- Sincroniza el paso obligatorio de Financiera para Solicitud de Anticipo.
-- Marcela Arango es la firmante permitida, pero el rol visible es Financiera.

DO $$
DECLARE
  sa_type_id document_types.id%TYPE;
  financiera_role_id document_type_roles.id%TYPE;
  marcela_role_id document_type_roles.id%TYPE;
BEGIN
  SELECT id INTO sa_type_id
  FROM document_types
  WHERE code = 'SA';

  IF sa_type_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro el tipo de documento SA';
  END IF;

  SELECT id INTO financiera_role_id
  FROM document_type_roles
  WHERE document_type_id = sa_type_id
    AND role_code = 'AREA_FINANCIERA'
  LIMIT 1;

  IF financiera_role_id IS NULL THEN
    INSERT INTO document_type_roles (
      document_type_id,
      role_name,
      role_code,
      order_position,
      is_required,
      description
    ) VALUES (
      sa_type_id,
      'Financiera',
      'AREA_FINANCIERA',
      4,
      true,
      'Firma obligatoria de Financiera realizada por Marcela Arango'
    )
    RETURNING id INTO financiera_role_id;
  END IF;

  SELECT id INTO marcela_role_id
  FROM document_type_roles
  WHERE document_type_id = sa_type_id
    AND role_code = 'MARCELA_ARANGO'
  LIMIT 1;

  IF marcela_role_id IS NOT NULL THEN
    UPDATE document_signers
    SET assigned_role_id = financiera_role_id,
        assigned_role_ids = array_replace(assigned_role_ids, marcela_role_id, financiera_role_id),
        role_name = CASE WHEN role_name = 'Marcela Arango' THEN 'Financiera' ELSE role_name END,
        role_names = array_replace(role_names, 'Marcela Arango', 'Financiera')
    WHERE assigned_role_id = marcela_role_id
       OR marcela_role_id = ANY(assigned_role_ids)
       OR role_name = 'Marcela Arango'
       OR 'Marcela Arango' = ANY(role_names);

    DELETE FROM document_type_roles
    WHERE id = marcela_role_id;
  END IF;

  UPDATE document_type_roles
  SET role_name = 'Financiera',
      order_position = 4,
      is_required = true,
      description = 'Firma obligatoria de Financiera realizada por Marcela Arango'
  WHERE id = financiera_role_id;

  UPDATE document_type_roles
  SET order_position = 5
  WHERE document_type_id = sa_type_id
    AND role_code = 'GERENCIA_EJECUTIVA';

  UPDATE document_type_roles
  SET order_position = 6
  WHERE document_type_id = sa_type_id
    AND role_code = 'TESORERIA';
END $$;

SELECT
  dt.code AS tipo_doc,
  dtr.role_name,
  dtr.role_code,
  dtr.order_position,
  dtr.is_required
FROM document_type_roles dtr
JOIN document_types dt ON dtr.document_type_id = dt.id
WHERE dt.code = 'SA'
ORDER BY dtr.order_position;
