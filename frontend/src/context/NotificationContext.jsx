import { createContext, useState, useCallback, useContext, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import { POLLING_INTERVALS, TIMEOUTS } from '../utils/constants';
import { getErrorMessage } from '../utils/helpers';

/**
 * Context para manejo de notificaciones
 * Proporciona estado y funciones relacionadas con notificaciones in-app
 */
export const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { token, handleAuthError, isAuthenticated } = useContext(AuthContext);

  // Estado de notificaciones
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Estado de notificación toast
  const [toastNotification, setToastNotification] = useState(null);

  /**
   * Realiza una consulta GraphQL
   */
  const graphqlQuery = useCallback(async (query, variables = {}) => {
    try {
      const response = await fetch(import.meta.env.VITE_API_URL || 'http://192.168.0.30:5001/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ query, variables })
      });

      const result = await response.json();

      if (result.errors) {
        const error = result.errors[0];

        // Manejar error de autenticación
        if (handleAuthError(error)) {
          return null;
        }

        throw new Error(getErrorMessage(error));
      }

      return result.data;
    } catch (err) {
      throw err;
    }
  }, [token, handleAuthError]);

  /**
   * Carga notificaciones
   */
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);

      const data = await graphqlQuery(`
        query {
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
      `);

      if (data && data.notifications) {
        setNotifications(data.notifications);

        // Contar no leídas
        const unread = data.notifications.filter(n => !n.is_read).length;
        setUnreadCount(unread);
      }

      return data?.notifications || [];
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching notifications:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, graphqlQuery]);

  /**
   * Marca una notificación como leída
   */
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await graphqlQuery(`
        mutation MarkNotificationRead($id: ID!) {
          markNotificationRead(id: $id) {
            id
            is_read
          }
        }
      `, { id: notificationId });

      // Actualizar estado local
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );

      // Actualizar contador
      setUnreadCount(prev => Math.max(0, prev - 1));

      return { success: true };
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error('Error marking notification as read:', err);
      return { success: false, error: errorMessage };
    }
  }, [graphqlQuery]);

  /**
   * Marca todas las notificaciones como leídas
   */
  const markAllAsRead = useCallback(async () => {
    try {
      await graphqlQuery(`
        mutation MarkAllNotificationsRead {
          markAllNotificationsRead
        }
      `);

      // Actualizar estado local
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );

      // Resetear contador
      setUnreadCount(0);

      return { success: true };
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error('Error marking all notifications as read:', err);
      return { success: false, error: errorMessage };
    }
  }, [graphqlQuery]);

  /**
   * Elimina una notificación
   */
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      await graphqlQuery(`
        mutation DeleteNotification($id: ID!) {
          deleteNotification(id: $id)
        }
      `, { id: notificationId });

      // Actualizar estado local
      setNotifications(prev => {
        const notification = prev.find(n => n.id === notificationId);
        if (notification && !notification.is_read) {
          setUnreadCount(count => Math.max(0, count - 1));
        }
        return prev.filter(n => n.id !== notificationId);
      });

      return { success: true };
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error('Error deleting notification:', err);
      return { success: false, error: errorMessage };
    }
  }, [graphqlQuery]);

  /**
   * Muestra una notificación toast
   */
  const showToast = useCallback(({ title, message, type = 'info', duration = TIMEOUTS.NOTIFICATION_AUTO_HIDE }) => {
    const notification = {
      id: Date.now(),
      title,
      message,
      type
    };

    setToastNotification(notification);

    // Auto-ocultar después del tiempo especificado
    if (duration > 0) {
      setTimeout(() => {
        setToastNotification(null);
      }, duration);
    }
  }, []);

  /**
   * Oculta la notificación toast
   */
  const hideToast = useCallback(() => {
    setToastNotification(null);
  }, []);

  /**
   * Muestra notificación de éxito
   */
  const showSuccess = useCallback((message, title = 'Éxito') => {
    showToast({ title, message, type: 'success', duration: TIMEOUTS.SUCCESS_MESSAGE });
  }, [showToast]);

  /**
   * Muestra notificación de error
   */
  const showError = useCallback((message, title = 'Error') => {
    showToast({ title, message, type: 'error', duration: TIMEOUTS.ERROR_MESSAGE });
  }, [showToast]);

  /**
   * Muestra notificación de información
   */
  const showInfo = useCallback((message, title = 'Información') => {
    showToast({ title, message, type: 'info' });
  }, [showToast]);

  /**
   * Muestra notificación de advertencia
   */
  const showWarning = useCallback((message, title = 'Advertencia') => {
    showToast({ title, message, type: 'warning' });
  }, [showToast]);

  /**
   * Limpia el error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Polling automático de notificaciones
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch inicial
    fetchNotifications();

    // Polling cada 30 segundos
    const interval = setInterval(() => {
      fetchNotifications();
    }, POLLING_INTERVALS.NOTIFICATIONS);

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotifications]);

  const value = {
    // Estado
    notifications,
    unreadCount,
    loading,
    error,
    toastNotification,

    // Funciones de notificaciones
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,

    // Funciones de toast
    showToast,
    hideToast,
    showSuccess,
    showError,
    showInfo,
    showWarning,

    // Utilidades
    clearError
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
