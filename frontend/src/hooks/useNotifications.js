import { useContext } from 'react';
import { NotificationContext } from '../context/NotificationContext';

/**
 * Hook personalizado para usar el NotificationContext
 * Proporciona acceso a todas las funciones y estado de notificaciones
 *
 * @example
 * const { notifications, showSuccess, showError } = useNotifications();
 */
export const useNotifications = () => {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }

  return context;
};
