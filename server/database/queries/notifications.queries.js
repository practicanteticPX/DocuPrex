/**
 * Queries SQL para la tabla notifications
 * Centraliza todas las consultas relacionadas con notificaciones
 */

/**
 * Obtiene todas las notificaciones de un usuario
 */
const getNotificationsByUser = `
  SELECT
    n.*,
    u_actor.name as actor_name,
    d.title as document_title
  FROM notifications n
  LEFT JOIN users u_actor ON n.actor_id = u_actor.id
  LEFT JOIN documents d ON n.document_id = d.id
  WHERE n.user_id = $1
  ORDER BY n.created_at DESC
`;

/**
 * Obtiene notificaciones no leídas de un usuario
 */
const getUnreadNotifications = `
  SELECT
    n.*,
    u_actor.name as actor_name,
    d.title as document_title
  FROM notifications n
  LEFT JOIN users u_actor ON n.actor_id = u_actor.id
  LEFT JOIN documents d ON n.document_id = d.id
  WHERE n.user_id = $1
    AND n.is_read = false
  ORDER BY n.created_at DESC
`;

/**
 * Obtiene el conteo de notificaciones no leídas
 */
const getUnreadCount = `
  SELECT COUNT(*) as count
  FROM notifications
  WHERE user_id = $1
    AND is_read = false
`;

/**
 * Obtiene notificaciones por tipo
 */
const getNotificationsByType = `
  SELECT
    n.*,
    u_actor.name as actor_name,
    d.title as document_title
  FROM notifications n
  LEFT JOIN users u_actor ON n.actor_id = u_actor.id
  LEFT JOIN documents d ON n.document_id = d.id
  WHERE n.user_id = $1
    AND n.type = $2
  ORDER BY n.created_at DESC
`;

/**
 * Crea una nueva notificación
 */
const createNotification = `
  INSERT INTO notifications (
    user_id,
    type,
    message,
    document_id,
    actor_id,
    is_read
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *
`;

/**
 * Marca una notificación como leída
 */
const markAsRead = `
  UPDATE notifications
  SET is_read = true
  WHERE id = $1
    AND user_id = $2
  RETURNING *
`;

/**
 * Marca todas las notificaciones como leídas para un usuario
 */
const markAllAsRead = `
  UPDATE notifications
  SET is_read = true
  WHERE user_id = $1
  RETURNING *
`;

/**
 * Elimina una notificación
 */
const deleteNotification = `
  DELETE FROM notifications
  WHERE id = $1
    AND user_id = $2
  RETURNING *
`;

/**
 * Elimina todas las notificaciones leídas de un usuario
 */
const deleteReadNotifications = `
  DELETE FROM notifications
  WHERE user_id = $1
    AND is_read = true
  RETURNING *
`;

/**
 * Elimina todas las notificaciones de un usuario
 */
const deleteAllNotifications = `
  DELETE FROM notifications
  WHERE user_id = $1
  RETURNING *
`;

/**
 * Elimina notificaciones antiguas (más de 30 días)
 */
const deleteOldNotifications = `
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND is_read = true
  RETURNING *
`;

/**
 * Obtiene notificaciones recientes (últimos 7 días)
 */
const getRecentNotifications = `
  SELECT
    n.*,
    u_actor.name as actor_name,
    d.title as document_title
  FROM notifications n
  LEFT JOIN users u_actor ON n.actor_id = u_actor.id
  LEFT JOIN documents d ON n.document_id = d.id
  WHERE n.user_id = $1
    AND n.created_at >= NOW() - INTERVAL '7 days'
  ORDER BY n.created_at DESC
`;

/**
 * Obtiene estadísticas de notificaciones de un usuario
 */
const getNotificationStats = `
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN is_read = false THEN 1 END) as unread,
    COUNT(CASE WHEN is_read = true THEN 1 END) as read,
    COUNT(CASE WHEN type = 'signature_request' THEN 1 END) as signature_requests,
    COUNT(CASE WHEN type = 'document_signed' THEN 1 END) as document_signed,
    COUNT(CASE WHEN type = 'document_completed' THEN 1 END) as document_completed,
    COUNT(CASE WHEN type = 'document_rejected' THEN 1 END) as document_rejected
  FROM notifications
  WHERE user_id = $1
`;

/**
 * Verifica si existe una notificación similar reciente (para evitar duplicados)
 */
const checkDuplicateNotification = `
  SELECT EXISTS(
    SELECT 1
    FROM notifications
    WHERE user_id = $1
      AND type = $2
      AND document_id = $3
      AND created_at >= NOW() - INTERVAL '5 minutes'
  ) as exists
`;

module.exports = {
  getNotificationsByUser,
  getUnreadNotifications,
  getUnreadCount,
  getNotificationsByType,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
  deleteAllNotifications,
  deleteOldNotifications,
  getRecentNotifications,
  getNotificationStats,
  checkDuplicateNotification
};
