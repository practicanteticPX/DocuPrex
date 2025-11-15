/**
 * Queries GraphQL para notificaciones
 * Contiene todas las consultas relacionadas con notificaciones
 */

/**
 * Fragment común de notificación
 */
export const NOTIFICATION_FRAGMENT = `
  fragment NotificationFields on Notification {
    id
    type
    message
    document_id
    actor_name
    is_read
    created_at
  }
`;

/**
 * Obtiene notificaciones del usuario
 */
export const GET_NOTIFICATIONS = `
  query GetNotifications {
    notifications {
      id
      type
      message
      document_id
      actor_name
      is_read
      created_at
    }
  }
`;

/**
 * Obtiene notificaciones no leídas
 */
export const GET_UNREAD_NOTIFICATIONS = `
  query GetUnreadNotifications {
    unreadNotifications {
      id
      type
      message
      document_id
      actor_name
      is_read
      created_at
    }
  }
`;

/**
 * Obtiene el conteo de notificaciones no leídas
 */
export const GET_UNREAD_COUNT = `
  query GetUnreadCount {
    unreadNotificationsCount
  }
`;
