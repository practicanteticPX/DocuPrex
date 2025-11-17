/**
 * Queries SQL para la tabla documents
 * Centraliza todas las consultas relacionadas con documentos
 */

/**
 * Obtiene un documento por ID con información del uploader
 */
const getDocumentById = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email
  FROM documents d
  JOIN users u ON d.uploaded_by = u.id
  WHERE d.id = $1
`;

/**
 * Obtiene todos los documentos con información del uploader
 */
const getAllDocuments = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email
  FROM documents d
  JOIN users u ON d.uploaded_by = u.id
  ORDER BY d.created_at DESC
`;

/**
 * Obtiene documentos de un usuario específico con estadísticas
 */
const getDocumentsByUser = `
  SELECT
    d.*,
    dt.name as document_type_name,
    dt.code as document_type_code,
    COUNT(DISTINCT ds.user_id) as total_signers,
    COUNT(DISTINCT CASE WHEN s.status = 'signed' THEN s.signer_id END) as signed_count,
    COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.signer_id END) as pending_count,
    COUNT(DISTINCT CASE WHEN s.status = 'rejected' THEN s.signer_id END) as rejected_count
  FROM documents d
  LEFT JOIN document_types dt ON d.document_type_id = dt.id
  LEFT JOIN document_signers ds ON d.id = ds.document_id
  LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
  WHERE d.uploaded_by = $1
  GROUP BY d.id, dt.name, dt.code
  ORDER BY d.created_at DESC
`;

/**
 * Obtiene documentos pendientes de firma para un usuario
 * Incluye validación de orden de firmantes
 */
const getPendingDocumentsForUser = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email,
    dt.name as document_type_name,
    dt.code as document_type_code,
    COALESCE(s.status, 'pending') as my_signature_status,
    ds.order_position as my_order_position,
    dtr.role_code as my_role_code,
    dtr.role_name as my_role_name,
    (
      SELECT MIN(ds_req.order_position)
      FROM document_signers ds_req
      LEFT JOIN signatures s_req ON ds_req.document_id = s_req.document_id
        AND ds_req.user_id = s_req.signer_id
      WHERE ds_req.document_id = d.id
        AND COALESCE(s_req.status, 'pending') = 'pending'
        AND ds_req.is_required = true
    ) as current_required_position,
    CASE
      WHEN ds.order_position > 1 THEN (
        SELECT COUNT(*)
        FROM document_signers ds_prev
        LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id
          AND ds_prev.user_id = s_prev.signer_id
        WHERE ds_prev.document_id = d.id
          AND ds_prev.order_position < ds.order_position
          AND COALESCE(s_prev.status, 'pending') != 'signed'
      )
      ELSE 0
    END as pending_previous_signers
  FROM document_signers ds
  JOIN documents d ON ds.document_id = d.id
  JOIN users u ON d.uploaded_by = u.id
  LEFT JOIN document_types dt ON d.document_type_id = dt.id
  LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
  LEFT JOIN document_type_roles dtr ON ds.role_code = dtr.role_code
    AND d.document_type_id = dtr.document_type_id
  WHERE ds.user_id = $1
    AND COALESCE(s.status, 'pending') = 'pending'
    AND d.status NOT IN ('completed', 'archived', 'rejected')
    AND NOT EXISTS (
      SELECT 1
      FROM document_signers ds_prev
      LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id
        AND ds_prev.user_id = s_prev.signer_id
      WHERE ds_prev.document_id = d.id
        AND ds_prev.order_position < ds.order_position
        AND COALESCE(s_prev.status, 'pending') = 'rejected'
    )
  ORDER BY d.created_at DESC
`;

/**
 * Obtiene documentos firmados por un usuario
 */
const getSignedDocumentsByUser = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email,
    dt.name as document_type_name,
    dt.code as document_type_code,
    s.status as signature_status,
    s.signed_at,
    s.consecutivo
  FROM document_signers ds
  JOIN documents d ON ds.document_id = d.id
  JOIN users u ON d.uploaded_by = u.id
  LEFT JOIN document_types dt ON d.document_type_id = dt.id
  JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
  WHERE ds.user_id = $1
    AND s.status = 'signed'
  ORDER BY s.signed_at DESC
`;

/**
 * Obtiene documentos rechazados por un usuario
 */
const getRejectedDocumentsByUser = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email,
    dt.name as document_type_name,
    dt.code as document_type_code,
    s.status as signature_status,
    s.rejected_at,
    s.rejection_reason
  FROM document_signers ds
  JOIN documents d ON ds.document_id = d.id
  JOIN users u ON d.uploaded_by = u.id
  LEFT JOIN document_types dt ON d.document_type_id = dt.id
  JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
  WHERE ds.user_id = $1
    AND s.status = 'rejected'
  ORDER BY s.rejected_at DESC
`;

/**
 * Obtiene documentos que el usuario subió y fueron rechazados por otros
 */
const getDocumentsRejectedByOthers = `
  SELECT DISTINCT
    d.*,
    dt.name as document_type_name,
    dt.code as document_type_code,
    u_rejector.name as rejector_name,
    s.rejection_reason,
    s.rejected_at
  FROM documents d
  LEFT JOIN document_types dt ON d.document_type_id = dt.id
  JOIN signatures s ON d.id = s.document_id
  JOIN users u_rejector ON s.signer_id = u_rejector.id
  WHERE d.uploaded_by = $1
    AND s.status = 'rejected'
  ORDER BY s.rejected_at DESC
`;

/**
 * Obtiene documentos por estado
 */
const getDocumentsByStatus = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email
  FROM documents d
  JOIN users u ON d.uploaded_by = u.id
  WHERE d.status = $1
  ORDER BY d.created_at DESC
`;

/**
 * Obtiene documentos por tipo
 */
const getDocumentsByType = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email,
    dt.name as document_type_name,
    dt.code as document_type_code
  FROM documents d
  JOIN users u ON d.uploaded_by = u.id
  LEFT JOIN document_types dt ON d.document_type_id = dt.id
  WHERE d.document_type_id = $1
  ORDER BY d.created_at DESC
`;

/**
 * Busca documentos por título o descripción
 */
const searchDocuments = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email
  FROM documents d
  JOIN users u ON d.uploaded_by = u.id
  WHERE
    d.title ILIKE $1
    OR d.description ILIKE $1
  ORDER BY d.created_at DESC
  LIMIT 50
`;

/**
 * Crea un nuevo documento
 */
const createDocument = `
  INSERT INTO documents (
    title,
    description,
    file_name,
    file_path,
    uploaded_by,
    document_type_id,
    status
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING *
`;

/**
 * Actualiza un documento
 */
const updateDocument = `
  UPDATE documents
  SET
    title = COALESCE($2, title),
    description = COALESCE($3, description),
    status = COALESCE($4, status),
    file_path = COALESCE($5, file_path)
  WHERE id = $1
  RETURNING *
`;

/**
 * Actualiza el estado de un documento
 */
const updateDocumentStatus = `
  UPDATE documents
  SET status = $2
  WHERE id = $1
  RETURNING *
`;

/**
 * Elimina un documento
 */
const deleteDocument = `
  DELETE FROM documents
  WHERE id = $1
  RETURNING *
`;

/**
 * Obtiene estadísticas de documentos
 */
const getDocumentStats = `
  SELECT
    status,
    COUNT(*) as count
  FROM documents
  GROUP BY status
`;

/**
 * Obtiene estadísticas de documentos por usuario
 */
const getDocumentStatsByUser = `
  SELECT
    uploaded_by,
    u.name as uploader_name,
    COUNT(*) as total_documents,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
  FROM documents
  JOIN users u ON documents.uploaded_by = u.id
  GROUP BY uploaded_by, u.name
  ORDER BY total_documents DESC
`;

/**
 * Verifica si un usuario puede firmar un documento (validación de orden)
 */
const canUserSignDocument = `
  SELECT
    CASE
      WHEN ds.order_position = 1 THEN true
      WHEN NOT EXISTS (
        SELECT 1
        FROM document_signers ds_prev
        LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id
          AND ds_prev.user_id = s_prev.signer_id
        WHERE ds_prev.document_id = $1
          AND ds_prev.order_position < ds.order_position
          AND COALESCE(s_prev.status, 'pending') != 'signed'
      ) THEN true
      ELSE false
    END as can_sign
  FROM document_signers ds
  WHERE ds.document_id = $1
    AND ds.user_id = $2
`;

/**
 * Obtiene documentos recientes (últimos 30 días)
 */
const getRecentDocuments = `
  SELECT
    d.*,
    u.name as uploader_name,
    u.email as uploader_email
  FROM documents d
  JOIN users u ON d.uploaded_by = u.id
  WHERE d.created_at >= NOW() - INTERVAL '30 days'
  ORDER BY d.created_at DESC
  LIMIT 100
`;

module.exports = {
  getDocumentById,
  getAllDocuments,
  getDocumentsByUser,
  getPendingDocumentsForUser,
  getSignedDocumentsByUser,
  getRejectedDocumentsByUser,
  getDocumentsRejectedByOthers,
  getDocumentsByStatus,
  getDocumentsByType,
  searchDocuments,
  createDocument,
  updateDocument,
  updateDocumentStatus,
  deleteDocument,
  getDocumentStats,
  getDocumentStatsByUser,
  canUserSignDocument,
  getRecentDocuments
};
