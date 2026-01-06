import { useState, useEffect } from 'react';
import graphqlClient from '../../api/client';
import './SessionsDashboard.css';

const ACTIVE_SESSIONS_QUERY = `
  query ActiveSessions {
    activeSessions {
      id
      userId
      userName
      userEmail
      loginTime
      isActive
      hoursElapsed
      hoursRemaining
    }
  }
`;

const CLOSE_SESSION_MUTATION = `
  mutation CloseUserSession($sessionId: Int!) {
    closeUserSession(sessionId: $sessionId)
  }
`;

function SessionsDashboard({ isOpen, onClose, socket }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [closingSessionId, setClosingSessionId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, sessionId: null, userName: '' });
  const [currentTime, setCurrentTime] = useState(Date.now());

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await graphqlClient.query(ACTIVE_SESSIONS_QUERY);
      setSessions(data.activeSessions || []);
    } catch (err) {
      console.error('Error cargando sesiones:', err);
      setError(err.message || 'Error al cargar las sesiones activas');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConfirmModal = (sessionId, userName) => {
    setConfirmModal({ isOpen: true, sessionId, userName });
  };

  const handleCancelClose = () => {
    setConfirmModal({ isOpen: false, sessionId: null, userName: '' });
  };

  const handleConfirmClose = async () => {
    const { sessionId, userName } = confirmModal;

    try {
      setClosingSessionId(sessionId);
      setConfirmModal({ isOpen: false, sessionId: null, userName: '' });
      await graphqlClient.mutate(CLOSE_SESSION_MUTATION, { sessionId });
    } catch (err) {
      console.error('❌ Error cerrando sesión:', err);
      setError(err.message || 'Error al cerrar la sesión');
    } finally {
      setClosingSessionId(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessions();

      if (socket) {
        const handleSessionsUpdated = (data) => {
          console.log('📡 Sesiones actualizadas (WebSocket):', data);
          fetchSessions();
        };

        socket.on('sessions:updated', handleSessionsUpdated);

        return () => {
          socket.off('sessions:updated', handleSessionsUpdated);
        };
      }
    }
  }, [isOpen, socket]);

  // Bloquear scroll vertical cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Actualizar tiempo cada segundo para mostrar en tiempo real
  useEffect(() => {
    if (isOpen) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatTime = (hours) => {
    const totalSeconds = Math.floor(hours * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const calculateElapsedTime = (loginTime) => {
    const login = new Date(loginTime);
    const now = currentTime;
    const diffMs = now - login.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    return formatTime(hours);
  };

  const calculateRemainingTime = (loginTime) => {
    const login = new Date(loginTime);
    const now = currentTime;
    const diffMs = now - login.getTime();
    const elapsedHours = diffMs / (1000 * 60 * 60);
    const remainingHours = Math.max(0, 8 - elapsedHours);
    return formatTime(remainingHours);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  if (!isOpen) return null;

  return (
    <div className="sessions-fullscreen-overlay">
      <div className="sessions-fullscreen-container">
        <div className="sessions-modal-header">
          <div className="sessions-header-content">
            <h2>Sesiones Activas</h2>
            <p className="sessions-instruction">
              Todas las sesiones activas del sistema. Tiempo máximo: 8 horas.
            </p>
          </div>
          <button className="sessions-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="sessions-modal-body">
          {error && (
            <div className="sessions-error">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {loading && sessions.length === 0 ? (
            <div className="sessions-loading">
              <div className="sessions-spinner"></div>
              <p>Cargando sesiones activas...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="sessions-empty">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p>No hay sesiones activas en este momento</p>
            </div>
          ) : (
            <>
              <div className="sessions-count-new">
                <div className="sessions-count-badge">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="sessions-count-icon">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="sessions-count-text">
                    <strong>Sesiones Activas</strong>
                    <span className="sessions-count-status">● {sessions.length} en curso</span>
                  </span>
                </div>
                <button
                  className="sessions-refresh-btn-new"
                  onClick={fetchSessions}
                  disabled={loading}
                  title="Actualizar lista"
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4V9H4.58152M19.9381 11C19.446 7.05369 16.0796 4 12 4C8.64262 4 5.76829 6.06817 4.58152 9M4.58152 9H9M20 20V15H19.4185M19.4185 15C18.2317 17.9318 15.3574 20 12 20C7.92038 20 4.55399 16.9463 4.06189 13M19.4185 15H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Actualizar
                </button>
              </div>

              <div className="sessions-table-container-new">
                <table className="sessions-table-new">
                  <thead>
                    <tr>
                      <th>USUARIO</th>
                      <th>INICIO DE SESIÓN</th>
                      <th>TIEMPO TRANSCURRIDO</th>
                      <th>TIEMPO RESTANTE</th>
                      <th>ACCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <div className="session-user-info">
                            <div className="session-avatar">
                              {getInitials(session.userName)}
                            </div>
                            <span className="session-user-name">{session.userName}</span>
                          </div>
                        </td>
                        <td className="session-time">{formatDate(session.loginTime)}</td>
                        <td>
                          <div className="session-time-badge elapsed">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            {calculateElapsedTime(session.loginTime)}
                          </div>
                        </td>
                        <td>
                          <div className="session-time-badge remaining">
                            {calculateRemainingTime(session.loginTime)}
                          </div>
                        </td>
                        <td className="session-actions">
                          <button
                            className="session-close-btn-new"
                            onClick={() => handleOpenConfirmModal(session.id, session.userName)}
                            disabled={closingSessionId === session.id}
                          >
                            {closingSessionId === session.id ? (
                              <span className="btn-loading">...</span>
                            ) : (
                              <>
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Cerrar
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="sessions-modal-footer">
          <button className="sessions-btn-close" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {confirmModal.isOpen && (
        <div className="confirm-modal-overlay" onClick={handleCancelClose}>
          <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="confirm-modal-icon">
                <path d="M12 9V11M12 15H12.01M5.07183 19H18.9282C20.4678 19 21.4301 17.3333 20.6603 16L13.7321 4C12.9623 2.66667 11.0378 2.66667 10.268 4L3.33978 16C2.56998 17.3333 3.53223 19 5.07183 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <h3>Confirmar Cierre de Sesión</h3>
            </div>
            <div className="confirm-modal-body">
              <p>¿Estás seguro de cerrar la sesión de <strong>{confirmModal.userName}</strong>?</p>
              <p className="confirm-modal-warning">El usuario deberá volver a iniciar sesión inmediatamente.</p>
            </div>
            <div className="confirm-modal-footer">
              <button className="confirm-btn-cancel" onClick={handleCancelClose}>
                Cancelar
              </button>
              <button className="confirm-btn-confirm" onClick={handleConfirmClose}>
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionsDashboard;
