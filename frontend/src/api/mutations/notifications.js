/**
 * Mutations GraphQL para notificaciones
 * Contiene todas las mutaciones relacionadas con notificaciones
 */

/**
 * Marca una notificación como leída
 */
export const MARK_NOTIFICATION_READ = `
  mutation MarkNotificationRead($id: Int!) {
    markNotificationRead(id: $id) {
      id
      is_read
    }
  }
`;

/**
 * Marca todas las notificaciones como leídas
 */
export const MARK_ALL_NOTIFICATIONS_READ = `
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

/**
 * Elimina una notificación
 */
export const DELETE_NOTIFICATION = `
  mutation DeleteNotification($id: Int!) {
    deleteNotification(id: $id)
  }
`;

/**
 * Elimina todas las notificaciones leídas
 */
export const DELETE_READ_NOTIFICATIONS = `
  mutation DeleteReadNotifications {
    deleteReadNotifications
  }
`;

/**
 * Elimina todas las notificaciones
 */
export const DELETE_ALL_NOTIFICATIONS = `
  mutation DeleteAllNotifications {
    deleteAllNotifications
  }
`;
