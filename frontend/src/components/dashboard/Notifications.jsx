import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Notifications.css';
import { API_URL } from '../../config/api';
import Loader from '../Loader/Loader';
import { Bell } from '../ui/animated-icons';

/**
 * Helper function para manejar errores de autenticación en GraphQL
 * Retorna true si es un error de autenticación que debe ser silenciado
 */
const isAuthError = (error) => {
  if (!error) return false;
  const message = error.message || '';
  return message.includes('autenticado') || message.includes('authenticated') || message.includes('No autenticado');
};

// Función para calcular el tiempo relativo
const getRelativeTime = (dateString) => {
  if (!dateString) return 'Ahora';

  // Si es un número (timestamp en milisegundos), convertirlo directamente
  let date;
  if (typeof dateString === 'number') {
    date = new Date(dateString);
  } else {
    // Si es string, intentar parsearlo como número primero
    const timestamp = parseInt(dateString);
    if (!isNaN(timestamp) && timestamp > 0) {
      date = new Date(timestamp);
    } else {
      // Si no es un número, intentar parsear como fecha ISO
      date = new Date(dateString);
    }
  }

  // Validar que la fecha sea válida
  if (isNaN(date.getTime())) {
    console.error('Fecha inválida:', dateString);
    return 'Ahora';
  }

  // Obtener el tiempo actual
  const now = new Date();

  // Calcular diferencia en milisegundos
  const diffInMs = now.getTime() - date.getTime();

  // Si la diferencia es negativa (fecha futura), mostrar "Ahora"
  if (diffInMs < 0) {
    return 'Ahora';
  }

  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInMonths = Math.floor(diffInDays / 30);

  if (diffInSeconds < 60) return 'Ahora';
  if (diffInMinutes === 1) return 'Hace 1 min';
  if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`;
  if (diffInHours === 1) return 'Hace 1 hora';
  if (diffInHours < 24) return `Hace ${diffInHours} horas`;
  if (diffInDays === 1) return 'Ayer';
  if (diffInDays < 30) return `Hace ${diffInDays} días`;
  if (diffInMonths === 1) return 'Hace 1 mes';
  if (diffInMonths > 0) return `Hace ${diffInMonths} meses`;

  return 'Ahora';
};

// Función para obtener el mensaje de la notificación
const getNotificationMessage = (notification) => {
  // Priorizar realSignerName (persona por quien se firmó) sobre actor.name (usuario logueado)
  // Para grupos de causación o firma "por otra persona", mostrar el nombre correcto
  const actorName = notification.actor?.realSignerName || notification.actor?.name || 'Alguien';
  const documentTitle = notification.documentTitle || 'el documento';

  switch (notification.type) {
    case 'signature_request':
      return `${actorName} te asignó como firmante del documento: ${documentTitle}`;
    case 'document_signed':
      return `${actorName} firmó el documento: ${documentTitle}`;
    case 'document_completed':
      return `El documento "${documentTitle}" ha sido completado - Todos los firmantes han firmado`;
    case 'document_rejected':
      return `${actorName} ha rechazado tu documento: ${documentTitle}`;
    case 'document_rejected_by_other':
      return `${actorName} rechazó el documento: ${documentTitle}`;
    case 'document_deleted':
      return `${actorName} eliminó el documento: ${documentTitle}`;
    default:
      return 'Nueva notificación';
  }
};

// Función para obtener el tipo de notificación para mostrar
const getNotificationType = (type) => {
  switch (type) {
    case 'signature_request':
      return 'Solicitud de firma recibida';
    case 'document_signed':
      return 'Documento firmado';
    case 'document_completed':
      return 'Documento completado';
    case 'document_rejected':
      return 'Documento rechazado';
    case 'document_rejected_by_other':
      return 'Documento rechazado';
    case 'document_deleted':
      return 'Documento eliminado';
    default:
      return 'Notificación';
  }
};

const Notifications = ({ onNotificationClick, socket }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isBellHovered, setIsBellHovered] = useState(false);
  const dropdownRef = useRef(null);

  // Obtener el ID del usuario actual desde el token
  const getCurrentUserId = () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;

      // Decodificar el token JWT (payload es la segunda parte)
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.id || decoded.userId;
    } catch (err) {
      console.error('Error al decodificar token:', err);
      return null;
    }
  };

  // Cargar notificaciones
  const loadNotifications = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');

      // Si no hay token, no intentar cargar
      if (!token) {
        console.warn('No hay token disponible para cargar notificaciones');
        return;
      }

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              notifications {
                id
                type
                documentId
                documentTitle
                isRead
                createdAt
                actor {
                  id
                  name
                  email
                  realSignerName
                }
              }
              unreadNotificationsCount
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        const error = response.data.errors[0];
        // Si el error es de autenticación, silenciar el error pero no cargar datos
        if (isAuthError(error)) {
          console.warn('Token inválido o expirado al cargar notificaciones');
          setNotifications([]);
          setUnreadCount(0);
          return;
        }
        throw new Error(error.message);
      }

      setNotifications(response.data.data.notifications || []);
      setUnreadCount(response.data.data.unreadNotificationsCount || 0);
    } catch (err) {
      console.error('Error al cargar notificaciones:', err);
      // Silenciar errores de autenticación para evitar mostrar errores al usuario
      if (isAuthError(err)) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } finally {
      setLoading(false);
    }
  };

  // Marcar notificación como leída
  const markAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        API_URL,
        {
          query: `
            mutation MarkNotificationAsRead($notificationId: Int!) {
              markNotificationAsRead(notificationId: $notificationId) {
                id
                isRead
              }
            }
          `,
          variables: { notificationId }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      // Actualizar el estado local
      setNotifications(notifications.map(n =>
        n.id === notificationId ? { ...n, isRead: true } : n
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (err) {
      console.error('Error al marcar notificación como leída:', err);
    }
  };

  // Marcar todas como leídas
  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        API_URL,
        {
          query: `
            mutation {
              markAllNotificationsAsRead
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      // Actualizar el estado local
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error al marcar todas las notificaciones como leídas:', err);
    }
  };

  // Cargar notificaciones al montar el componente (solo una vez)
  useEffect(() => {
    loadNotifications();
  }, []);

  // Escuchar eventos de WebSocket para notificaciones en tiempo real
  useEffect(() => {
    if (!socket) return;

    // Nueva notificación creada
    const handleNotificationCreated = (data) => {
      console.log('🔔 Nueva notificación recibida por WebSocket:', data);

      // IMPORTANTE: Verificar que la notificación sea para el usuario actual
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        console.warn('⚠️ No se pudo obtener el ID del usuario actual');
        return;
      }

      // Filtrar: Solo agregar si la notificación es para este usuario
      if (data.userId !== currentUserId) {
        console.log(`⏭️ Notificación ignorada (destinatario: ${data.userId}, usuario actual: ${currentUserId})`);
        return;
      }

      // Si el evento incluye información completa de la notificación, agregarla directamente
      // De lo contrario, recargar para obtener información completa
      if (data.notification && data.notification.id) {
        // Agregar la nueva notificación al inicio de la lista
        setNotifications(prev => {
          // Evitar duplicados
          const exists = prev.find(n => n.id === data.notification.id);
          if (exists) return prev;

          // Construir notificación completa
          const newNotification = {
            id: data.notification.id,
            type: data.notification.type,
            documentId: data.notification.document_id || data.notification.documentId,
            documentTitle: data.notification.document_title || data.notification.documentTitle,
            isRead: false,
            createdAt: Date.now(),
            actor: data.notification.actor ? {
              id: data.notification.actor.id,
              name: data.notification.actor.name,
              email: data.notification.actor.email,
              realSignerName: data.notification.actor.realSignerName
            } : null
          };

          return [newNotification, ...prev];
        });

        // Incrementar contador de no leídas
        setUnreadCount(prev => prev + 1);
      } else {
        // Fallback: recargar si no hay información completa
        console.log('⚠️ Notificación sin información completa, recargando lista...');
        loadNotifications();
      }
    };

    // Notificación eliminada (por ejemplo, cuando se elimina el documento)
    const handleNotificationDeleted = (data) => {
      console.log('🗑️ Notificación eliminada por WebSocket:', data);

      // Verificar si es para el usuario actual
      const currentUserId = getCurrentUserId();

      // Caso 1: Eliminación específica por userId y tipo (ej: al firmar)
      if (data.documentId && data.userId && data.type) {
        // Solo eliminar si es para este usuario
        if (data.userId === currentUserId) {
          console.log(`🗑️ Eliminando notificaciones de tipo "${data.type}" para documento ${data.documentId}`);
          setNotifications(prev => {
            const filtered = prev.filter(n =>
              !(n.documentId === data.documentId && n.type === data.type)
            );
            // Recalcular no leídas
            const deletedUnread = prev.filter(n =>
              n.documentId === data.documentId && n.type === data.type && !n.isRead
            ).length;
            setUnreadCount(prevCount => Math.max(0, prevCount - deletedUnread));
            return filtered;
          });
        } else {
          console.log(`⏭️ Eliminación ignorada (es para usuario ${data.userId}, actual: ${currentUserId})`);
        }
      }
      // Caso 2: Remover todas las notificaciones del documento (ej: documento eliminado)
      else if (data.documentId) {
        setNotifications(prev => prev.filter(n => n.documentId !== data.documentId));
        // Recalcular contador de no leídas
        setUnreadCount(prev => {
          const deletedUnread = notifications.filter(n =>
            n.documentId === data.documentId && !n.isRead
          ).length;
          return Math.max(0, prev - deletedUnread);
        });
      }
      // Caso 3: Eliminar una notificación específica por ID
      else if (data.notificationId) {
        const notification = notifications.find(n => n.id === data.notificationId);
        setNotifications(prev => prev.filter(n => n.id !== data.notificationId));
        if (notification && !notification.isRead) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
    };

    // Notificación marcada como leída
    const handleNotificationRead = (data) => {
      console.log('✅ Notificación marcada como leída por WebSocket:', data);

      // Filtrar: Solo actualizar si es del usuario actual
      const currentUserId = getCurrentUserId();
      if (data.userId && data.userId !== currentUserId) {
        console.log(`⏭️ Evento notification:read ignorado (no es para este usuario)`);
        return;
      }

      if (data.notificationId) {
        setNotifications(prev => prev.map(n =>
          n.id === data.notificationId ? { ...n, isRead: true } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    };

    // Todas las notificaciones marcadas como leídas
    const handleAllNotificationsRead = (data) => {
      console.log('✅ Todas las notificaciones marcadas como leídas por WebSocket', data);

      // Filtrar: Solo actualizar si es del usuario actual
      const currentUserId = getCurrentUserId();
      if (data.userId && data.userId !== currentUserId) {
        console.log(`⏭️ Evento notification:all_read ignorado (no es para este usuario)`);
        return;
      }

      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    };

    socket.on('notification:created', handleNotificationCreated);
    socket.on('notification:deleted', handleNotificationDeleted);
    socket.on('notification:read', handleNotificationRead);
    socket.on('notification:all_read', handleAllNotificationsRead);

    return () => {
      socket.off('notification:created', handleNotificationCreated);
      socket.off('notification:deleted', handleNotificationDeleted);
      socket.off('notification:read', handleNotificationRead);
      socket.off('notification:all_read', handleAllNotificationsRead);
    };
  }, [socket, notifications]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="notifications-container" ref={dropdownRef}>
      <button
        className="notifications-bell-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notificaciones"
        onMouseEnter={() => setIsBellHovered(true)}
        onMouseLeave={() => setIsBellHovered(false)}
      >
        <Bell isAnimating={isBellHovered} size={24} strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="notifications-badge"></span>
        )}
      </button>

      {isOpen && (
        <div className="notifications-dropdown">
          <div className="notifications-header">
            <h3>Notificaciones</h3>
            {unreadCount > 0 && (
              <button
                className="mark-all-read-button"
                onClick={markAllAsRead}
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          <div className="notifications-list">
            {loading ? (
              <div className="notifications-loading">
                <Loader size="small" />
                <p>Cargando notificaciones...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="notifications-empty">
                <p>No tienes notificaciones</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
                  onClick={() => {
                    console.log('🔔 Notification clicked:', notification);
                    console.log('🔔 Document ID type:', typeof notification.documentId, notification.documentId);
                    if (!notification.isRead) {
                      markAsRead(notification.id);
                    }
                    // Cerrar el dropdown
                    setIsOpen(false);
                    // Navegar al documento
                    if (onNotificationClick) {
                      console.log('🔔 Calling onNotificationClick with:', notification);
                      onNotificationClick(notification);
                    } else {
                      console.error('❌ onNotificationClick callback is not defined');
                    }
                  }}
                >
                  {!notification.isRead && <div className="notification-unread-dot"></div>}

                  <div className="notification-content">
                    <div className="notification-type">
                      {getNotificationType(notification.type)}
                    </div>
                    <div className="notification-message">
                      {getNotificationMessage(notification)}
                    </div>
                  </div>

                  <div className="notification-time">
                    {getRelativeTime(notification.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
