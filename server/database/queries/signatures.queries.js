/**
 * Queries SQL para las tablas signatures y document_signers
 * Centraliza todas las consultas relacionadas con firmas
 */

/**
 * Obtiene todas las firmas de un documento
 */
const getSignaturesByDocument = `
  SELECT
    s.*,
    u.name as signer_name,
    u.email as signer_email,
    ds.order_position,
    ds.is_required,
    dtr.role_code,
    dtr.role_name
  FROM signatures s
  JOIN users u ON s.signer_id = u.id
  LEFT JOIN document_signers ds ON s.document_id = ds.document_id
    AND s.signer_id = ds.user_id
  LEFT JOIN documents d ON s.document_id = d.id
  LEFT JOIN document_type_roles dtr ON ds.role_code = dtr.role_code
    AND d.document_type_id = dtr.document_type_id
  WHERE s.document_id = $1
  ORDER BY ds.order_position ASC
`;

/**
 * Obtiene una firma específica
 */
const getSignatureByDocumentAndUser = `
  SELECT
    s.*,
    u.name as signer_name,
    u.email as signer_email,
    ds.order_position,
    ds.is_required
  FROM signatures s
  JOIN users u ON s.signer_id = u.id
  LEFT JOIN document_signers ds ON s.document_id = ds.document_id
    AND s.signer_id = ds.user_id
  WHERE s.document_id = $1
    AND s.signer_id = $2
`;

/**
 * Crea una nueva firma
 */
const createSignature = `
  INSERT INTO signatures (
    document_id,
    signer_id,
    status,
    signed_at,
    consecutivo,
    signature_data
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *
`;

/**
 * Actualiza el estado de una firma a 'signed'
 */
const signDocument = `
  UPDATE signatures
  SET
    status = 'signed',
    signed_at = NOW(),
    consecutivo = $3,
    signature_data = $4
  WHERE document_id = $1
    AND signer_id = $2
  RETURNING *
`;

/**
 * Actualiza el estado de una firma a 'rejected'
 */
const rejectDocument = `
  UPDATE signatures
  SET
    status = 'rejected',
    rejected_at = NOW(),
    rejection_reason = $3
  WHERE document_id = $1
    AND signer_id = $2
  RETURNING *
`;

/**
 * Elimina una firma
 */
const deleteSignature = `
  DELETE FROM signatures
  WHERE document_id = $1
    AND signer_id = $2
  RETURNING *
`;

/**
 * Elimina todas las firmas de un documento
 */
const deleteSignaturesByDocument = `
  DELETE FROM signatures
  WHERE document_id = $1
  RETURNING *
`;

/**
 * Obtiene el conteo de firmas por estado para un documento
 */
const getSignatureCountByStatus = `
  SELECT
    status,
    COUNT(*) as count
  FROM signatures
  WHERE document_id = $1
  GROUP BY status
`;

/**
 * Verifica si todas las firmas requeridas están completadas
 */
const areAllRequiredSignaturesCompleted = `
  SELECT
    COUNT(*) = COUNT(CASE WHEN s.status = 'signed' THEN 1 END) as all_completed
  FROM document_signers ds
  LEFT JOIN signatures s ON ds.document_id = s.document_id
    AND ds.user_id = s.signer_id
  WHERE ds.document_id = $1
    AND ds.is_required = true
`;

/**
 * Obtiene firmantes asignados a un documento
 */
const getDocumentSigners = `
  SELECT
    ds.*,
    u.id as user_id,
    u.name,
    u.email,
    u.role,
    COALESCE(s.status, 'pending') as status,
    s.signed_at,
    s.rejected_at,
    s.rejection_reason,
    s.consecutivo,
    dtr.role_code,
    dtr.role_name
  FROM document_signers ds
  JOIN users u ON ds.user_id = u.id
  LEFT JOIN signatures s ON ds.document_id = s.document_id
    AND ds.user_id = s.signer_id
  LEFT JOIN documents d ON ds.document_id = d.id
  LEFT JOIN document_type_roles dtr ON ds.role_code = dtr.role_code
    AND d.document_type_id = dtr.document_type_id
  WHERE ds.document_id = $1
  ORDER BY ds.order_position ASC
`;

/**
 * Asigna un firmante a un documento
 */
const assignSigner = `
  INSERT INTO document_signers (
    document_id,
    user_id,
    order_position,
    is_required,
    role_code
  )
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (document_id, user_id) DO UPDATE
  SET
    order_position = EXCLUDED.order_position,
    is_required = EXCLUDED.is_required,
    role_code = EXCLUDED.role_code
  RETURNING *
`;



/**
 * Actualiza el rol de un firmante
 */
const updateSignerRole = `
  UPDATE document_signers
  SET role_code = $3
  WHERE document_id = $1
    AND user_id = $2
  RETURNING *
`;

/**
 * Elimina todos los firmantes de un documento
 */
const removeAllSigners = `
  DELETE FROM document_signers
  WHERE document_id = $1
  RETURNING *
`;

/**
 * Obtiene el siguiente firmante en el orden que debe firmar
 */
const getNextRequiredSigner = `
  SELECT
    ds.*,
    u.name,
    u.email
  FROM document_signers ds
  JOIN users u ON ds.user_id = u.id
  LEFT JOIN signatures s ON ds.document_id = s.document_id
    AND ds.user_id = s.signer_id
  WHERE ds.document_id = $1
    AND ds.is_required = true
    AND COALESCE(s.status, 'pending') = 'pending'
  ORDER BY ds.order_position ASC
  LIMIT 1
`;

/**
 * Obtiene firmantes pendientes de un documento
 */
const getPendingSigners = `
  SELECT
    ds.*,
    u.id as user_id,
    u.name,
    u.email,
    dtr.role_code,
    dtr.role_name
  FROM document_signers ds
  JOIN users u ON ds.user_id = u.id
  LEFT JOIN signatures s ON ds.document_id = s.document_id
    AND ds.user_id = s.signer_id
  LEFT JOIN documents d ON ds.document_id = d.id
  LEFT JOIN document_type_roles dtr ON ds.role_code = dtr.role_code
    AND d.document_type_id = dtr.document_type_id
  WHERE ds.document_id = $1
    AND COALESCE(s.status, 'pending') = 'pending'
  ORDER BY ds.order_position ASC
`;

/**
 * Obtiene estadísticas de firmas de un usuario
 */
const getUserSignatureStats = `
  SELECT
    COUNT(*) as total_signatures,
    COUNT(CASE WHEN status = 'signed' THEN 1 END) as signed,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
  FROM signatures
  WHERE signer_id = $1
`;

/**
 * Obtiene documentos que necesitan la firma del usuario en orden
 */
const getDocumentsAwaitingUserSignature = `
  SELECT
    d.*,
    ds.order_position,
    CASE
      WHEN ds.order_position = (
        SELECT MIN(ds_min.order_position)
        FROM document_signers ds_min
        LEFT JOIN signatures s_min ON ds_min.document_id = s_min.document_id
          AND ds_min.user_id = s_min.signer_id
        WHERE ds_min.document_id = d.id
          AND COALESCE(s_min.status, 'pending') = 'pending'
      ) THEN true
      ELSE false
    END as is_next_signer
  FROM document_signers ds
  JOIN documents d ON ds.document_id = d.id
  LEFT JOIN signatures s ON ds.document_id = s.document_id
    AND ds.user_id = s.signer_id
  WHERE ds.user_id = $1
    AND COALESCE(s.status, 'pending') = 'pending'
    AND d.status NOT IN ('completed', 'archived', 'rejected')
  ORDER BY d.created_at DESC
`;

/**
 * Verifica si hay algún firmante que haya rechazado
 */
const hasAnyRejection = `
  SELECT EXISTS(
    SELECT 1
    FROM signatures
    WHERE document_id = $1
      AND status = 'rejected'
  ) as has_rejection
`;

module.exports = {
  getSignaturesByDocument,
  getSignatureByDocumentAndUser,
  createSignature,
  signDocument,
  rejectDocument,
  deleteSignature,
  deleteSignaturesByDocument,
  getSignatureCountByStatus,
  areAllRequiredSignaturesCompleted,
  getDocumentSigners,
  assignSigner,
  updateSignerRole,
  removeAllSigners,
  getNextRequiredSigner,
  getPendingSigners,
  getUserSignatureStats,
  getDocumentsAwaitingUserSignature,
  hasAnyRejection
};
