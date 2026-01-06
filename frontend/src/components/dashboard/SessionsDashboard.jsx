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
      ipAddress
      userAgent
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

/**
 * Dashboard de sesiones activas (Solo Admin)
 * Permite ver todas las sesiones activas del sistema y cerrarlas remotamente
 *
 * SEGURIDAD: Solo visible para e.zuluaga@prexxa.com.co
 */
function SessionsDashboard({ isOpen, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [closingSessionId, setClosingSessionId] = useState(null);

  // Cargar sesiones activas
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

  // Cerrar sesión remota
  const handleCloseSession = async (sessionId, userName) => {
    if (!confirm(`¿Cerrar la sesión de ${userName}? El usuario deberá volver a iniciar sesión.`)) {
      return;
    }

    try {
      setClosingSessionId(sessionId);
      await graphqlClient.mutate(CLOSE_SESSION_MUTATION, { sessionId });

      // Actualizar lista de sesiones
      await fetchSessions();

      console.log(`✅ Sesión ${sessionId} cerrada exitosamente`);
    } catch (err) {
      console.error('Error cerrando sesión:', err);
      setError(err.message || 'Error al cerrar la sesión');
    } finally {
      setClosingSessionId(null);
    }
  };

  // Cargar sesiones al abrir el modal
  useEffect(() => {
    if (isOpen) {
      fetchSessions();

      // Auto-refresh cada 30 segundos mientras esté abierto
      const interval = setInterval(fetchSessions, 30000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Formatear fecha
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Formatear User Agent (navegador)
  const formatUserAgent = (ua) => {
    if (!ua) return 'Desconocido';

    // Detectar navegador
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';

    return 'Otro';
  };

  if (!isOpen) return null;

  return (
    <div className="sessions-modal-overlay">
      <div className="sessions-modal-content">
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
                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.3503 17.623 3.8507 18.1676 4.55231C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p>No hay sesiones activas en este momento</p>
            </div>
          ) : (
            <>
              <div className="sessions-count">
                <span className="sessions-count-number">{sessions.length}</span>
                <span className="sessions-count-label">
                  {sessions.length === 1 ? 'sesión activa' : 'sesiones activas'}
                </span>
                <button
                  className="sessions-refresh-btn"
                  onClick={fetchSessions}
                  disabled={loading}
                  title="Actualizar lista"
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4V9H4.58152M19.9381 11C19.446 7.05369 16.0796 4 12 4C8.64262 4 5.76829 6.06817 4.58152 9M4.58152 9H9M20 20V15H19.4185M19.4185 15C18.2317 17.9318 15.3574 20 12 20C7.92038 20 4.55399 16.9463 4.06189 13M19.4185 15H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              <div className="sessions-table-container">
                <table className="sessions-table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Email</th>
                      <th>Inicio de Sesión</th>
                      <th>Tiempo Transcurrido</th>
                      <th>Tiempo Restante</th>
                      <th>IP</th>
                      <th>Navegador</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id} className={session.hoursRemaining < 1 ? 'session-expiring' : ''}>
                        <td className="session-user-name">{session.userName}</td>
                        <td className="session-email">{session.userEmail}</td>
                        <td className="session-time">{formatDate(session.loginTime)}</td>
                        <td className="session-elapsed">
                          {session.hoursElapsed.toFixed(2)} h
                        </td>
                        <td className={`session-remaining ${session.hoursRemaining < 1 ? 'warning' : ''}`}>
                          {session.hoursRemaining.toFixed(2)} h
                          {session.hoursRemaining < 1 && (
                            <span className="expiring-badge">¡Expirando!</span>
                          )}
                        </td>
                        <td className="session-ip">{session.ipAddress || 'N/A'}</td>
                        <td className="session-browser">{formatUserAgent(session.userAgent)}</td>
                        <td className="session-actions">
                          <button
                            className="session-close-btn"
                            onClick={() => handleCloseSession(session.id, session.userName)}
                            disabled={closingSessionId === session.id}
                            title="Cerrar esta sesión remotamente"
                          >
                            {closingSessionId === session.id ? (
                              <span className="btn-loading">...</span>
                            ) : (
                              <>
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9M16 17L21 12M21 12L16 7M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
    </div>
  );
}

export default SessionsDashboard;
