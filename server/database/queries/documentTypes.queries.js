/**
 * Queries SQL para document_types y document_type_roles
 * Centraliza todas las consultas relacionadas con tipos de documentos
 */

/**
 * Obtiene todos los tipos de documentos
 */
const getAllDocumentTypes = `
  SELECT *
  FROM document_types
  ORDER BY name ASC
`;

/**
 * Obtiene un tipo de documento por ID
 */
const getDocumentTypeById = `
  SELECT *
  FROM document_types
  WHERE id = $1
`;

/**
 * Obtiene un tipo de documento por código
 */
const getDocumentTypeByCode = `
  SELECT *
  FROM document_types
  WHERE code = $1
`;

/**
 * Crea un nuevo tipo de documento
 */
const createDocumentType = `
  INSERT INTO document_types (name, code, prefix)
  VALUES ($1, $2, $3)
  RETURNING *
`;

/**
 * Actualiza un tipo de documento
 */
const updateDocumentType = `
  UPDATE document_types
  SET
    name = COALESCE($2, name),
    code = COALESCE($3, code),
    prefix = COALESCE($4, prefix)
  WHERE id = $1
  RETURNING *
`;

/**
 * Elimina un tipo de documento
 */
const deleteDocumentType = `
  DELETE FROM document_types
  WHERE id = $1
  RETURNING *
`;

/**
 * Obtiene todos los roles de un tipo de documento
 */
const getRolesByDocumentType = `
  SELECT *
  FROM document_type_roles
  WHERE document_type_id = $1
  ORDER BY order_position ASC
`;

/**
 * Obtiene un rol específico por código y tipo de documento
 */
const getRoleByCodeAndType = `
  SELECT *
  FROM document_type_roles
  WHERE document_type_id = $1
    AND role_code = $2
`;

/**
 * Crea un nuevo rol para un tipo de documento
 */
const createDocumentTypeRole = `
  INSERT INTO document_type_roles (
    document_type_id,
    role_name,
    role_code,
    order_position
  )
  VALUES ($1, $2, $3, $4)
  RETURNING *
`;

/**
 * Actualiza un rol de tipo de documento
 */
const updateDocumentTypeRole = `
  UPDATE document_type_roles
  SET
    role_name = COALESCE($3, role_name),
    order_position = COALESCE($4, order_position)
  WHERE document_type_id = $1
    AND role_code = $2
  RETURNING *
`;

/**
 * Elimina un rol de tipo de documento
 */
const deleteDocumentTypeRole = `
  DELETE FROM document_type_roles
  WHERE document_type_id = $1
    AND role_code = $2
  RETURNING *
`;

/**
 * Elimina todos los roles de un tipo de documento
 */
const deleteAllRolesByType = `
  DELETE FROM document_type_roles
  WHERE document_type_id = $1
  RETURNING *
`;

/**
 * Obtiene tipos de documentos con sus roles
 */
const getDocumentTypesWithRoles = `
  SELECT
    dt.*,
    json_agg(
      json_build_object(
        'role_name', dtr.role_name,
        'role_code', dtr.role_code,
        'order_position', dtr.order_position
      ) ORDER BY dtr.order_position
    ) FILTER (WHERE dtr.id IS NOT NULL) as roles
  FROM document_types dt
  LEFT JOIN document_type_roles dtr ON dt.id = dtr.document_type_id
  GROUP BY dt.id
  ORDER BY dt.name ASC
`;

/**
 * Verifica si un código de tipo de documento ya existe
 */
const checkDocumentTypeCodeExists = `
  SELECT EXISTS(
    SELECT 1
    FROM document_types
    WHERE code = $1
  ) as exists
`;

/**
 * Obtiene estadísticas de uso de tipos de documentos
 */
const getDocumentTypeUsageStats = `
  SELECT
    dt.id,
    dt.name,
    dt.code,
    COUNT(d.id) as document_count
  FROM document_types dt
  LEFT JOIN documents d ON dt.id = d.document_type_id
  GROUP BY dt.id, dt.name, dt.code
  ORDER BY document_count DESC
`;

module.exports = {
  getAllDocumentTypes,
  getDocumentTypeById,
  getDocumentTypeByCode,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  getRolesByDocumentType,
  getRoleByCodeAndType,
  createDocumentTypeRole,
  updateDocumentTypeRole,
  deleteDocumentTypeRole,
  deleteAllRolesByType,
  getDocumentTypesWithRoles,
  checkDocumentTypeCodeExists,
  getDocumentTypeUsageStats
};
