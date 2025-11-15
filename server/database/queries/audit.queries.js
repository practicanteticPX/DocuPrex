/**
 * Queries SQL para la tabla audit_log
 * Centraliza todas las consultas relacionadas con auditoría
 */

/**
 * Crea una entrada de auditoría
 */
const createAuditLog = `
  INSERT INTO audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES ($1, $2, $3, $4, $5)
  RETURNING *
`;

/**
 * Obtiene logs de auditoría por usuario
 */
const getAuditLogsByUser = `
  SELECT
    al.*,
    u.name as user_name,
    u.email as user_email
  FROM audit_log al
  JOIN users u ON al.user_id = u.id
  WHERE al.user_id = $1
  ORDER BY al.created_at DESC
  LIMIT 100
`;

/**
 * Obtiene logs de auditoría por entidad
 */
const getAuditLogsByEntity = `
  SELECT
    al.*,
    u.name as user_name,
    u.email as user_email
  FROM audit_log al
  JOIN users u ON al.user_id = u.id
  WHERE al.entity_type = $1
    AND al.entity_id = $2
  ORDER BY al.created_at DESC
`;

/**
 * Obtiene logs de auditoría por acción
 */
const getAuditLogsByAction = `
  SELECT
    al.*,
    u.name as user_name,
    u.email as user_email
  FROM audit_log al
  JOIN users u ON al.user_id = u.id
  WHERE al.action = $1
  ORDER BY al.created_at DESC
  LIMIT 100
`;

/**
 * Obtiene logs de auditoría recientes (últimos 30 días)
 */
const getRecentAuditLogs = `
  SELECT
    al.*,
    u.name as user_name,
    u.email as user_email
  FROM audit_log al
  JOIN users u ON al.user_id = u.id
  WHERE al.created_at >= NOW() - INTERVAL '30 days'
  ORDER BY al.created_at DESC
  LIMIT 500
`;

/**
 * Obtiene logs de auditoría en un rango de fechas
 */
const getAuditLogsByDateRange = `
  SELECT
    al.*,
    u.name as user_name,
    u.email as user_email
  FROM audit_log al
  JOIN users u ON al.user_id = u.id
  WHERE al.created_at BETWEEN $1 AND $2
  ORDER BY al.created_at DESC
`;

/**
 * Obtiene estadísticas de auditoría por acción
 */
const getAuditStatsByAction = `
  SELECT
    action,
    COUNT(*) as count
  FROM audit_log
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY action
  ORDER BY count DESC
`;

/**
 * Obtiene estadísticas de auditoría por usuario
 */
const getAuditStatsByUser = `
  SELECT
    al.user_id,
    u.name as user_name,
    COUNT(*) as total_actions,
    COUNT(CASE WHEN action = 'login' THEN 1 END) as logins,
    COUNT(CASE WHEN action = 'upload_document' THEN 1 END) as uploads,
    COUNT(CASE WHEN action = 'sign_document' THEN 1 END) as signatures,
    COUNT(CASE WHEN action = 'reject_document' THEN 1 END) as rejections
  FROM audit_log al
  JOIN users u ON al.user_id = u.id
  WHERE al.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY al.user_id, u.name
  ORDER BY total_actions DESC
`;

/**
 * Elimina logs de auditoría antiguos (más de 90 días)
 */
const deleteOldAuditLogs = `
  DELETE FROM audit_log
  WHERE created_at < NOW() - INTERVAL '90 days'
  RETURNING *
`;

/**
 * Obtiene el último login de un usuario
 */
const getLastLoginByUser = `
  SELECT
    al.*,
    u.name as user_name
  FROM audit_log al
  JOIN users u ON al.user_id = u.id
  WHERE al.user_id = $1
    AND al.action = 'login'
  ORDER BY al.created_at DESC
  LIMIT 1
`;

/**
 * Obtiene actividad reciente de un documento
 */
const getDocumentActivity = `
  SELECT
    al.*,
    u.name as user_name,
    u.email as user_email
  FROM audit_log al
  JOIN users u ON al.user_id = u.id
  WHERE al.entity_type = 'document'
    AND al.entity_id = $1
  ORDER BY al.created_at DESC
`;

/**
 * Cuenta acciones de un usuario en un período
 */
const countUserActionsInPeriod = `
  SELECT COUNT(*) as count
  FROM audit_log
  WHERE user_id = $1
    AND action = $2
    AND created_at >= $3
`;

module.exports = {
  createAuditLog,
  getAuditLogsByUser,
  getAuditLogsByEntity,
  getAuditLogsByAction,
  getRecentAuditLogs,
  getAuditLogsByDateRange,
  getAuditStatsByAction,
  getAuditStatsByUser,
  deleteOldAuditLogs,
  getLastLoginByUser,
  getDocumentActivity,
  countUserActionsInPeriod
};
