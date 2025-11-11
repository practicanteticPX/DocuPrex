import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Notifications.css';
import { API_URL } from '../../config/api';

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
  const actorName = notification.actor?.name || 'Alguien';
  const documentTitle = notification.documentTitle || 'el documento';

  switch (notification.type) {
    case 'signature_request':
      return `${actorName} te asignó como firmante`;
    case 'document_signed':
      return `${actorName} firmó el documento`;
    case 'document_completed':
      return `El documento ha sido completado - Todos los firmantes han firmado`;
    case 'document_rejected':
      return `${actorName} ha rechazado tu documento "${documentTitle}"`;
    case 'document_rejected_by_other':
      return `${actorName} rechazó el documento`;
    case 'document_deleted':
      return `${actorName} eliminó el documento`;
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

const Notifications = ({ onNotificationClick }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

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
            mutation MarkNotificationAsRead($notificationId: ID!) {
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

  // Cargar notificaciones al montar el componente
  useEffect(() => {
    loadNotifications();

    // Recargar notificaciones cada 30 segundos
    const interval = setInterval(loadNotifications, 30000);

    return () => clearInterval(interval);
  }, []);

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
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
                <div className="spinner-minimal"></div>
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
                    if (!notification.isRead) {
                      markAsRead(notification.id);
                    }
                    // Cerrar el dropdown
                    setIsOpen(false);
                    // Navegar al documento
                    if (onNotificationClick) {
                      onNotificationClick(notification);
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
                    <div className="notification-document-title">
                      {notification.documentTitle}
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
