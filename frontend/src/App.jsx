import { useState, useEffect } from 'react'
import axios from 'axios'
import Login from './components/login/Login.jsx'
import Dashboard from './components/dashboard/Dashboard.jsx'
import './App.css'
import { API_URL } from './config/api'
import { useServerHealth } from './hooks/useServerHealth'
import { isTokenExpired, getTokenTimeRemaining } from './utils/tokenManager'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)

  // Verificar si hay una sesión guardada al cargar la app
  useEffect(() => {
    // Guardar la URL actual si contiene /documento/
    const currentPath = window.location.pathname;
    if (currentPath.includes('/documento/')) {
      sessionStorage.setItem('redirectAfterLogin', currentPath);
      console.log('🔗 URL de documento guardada para después del login:', currentPath);
    }

    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')

    if (token && savedUser) {
      setIsAuthenticated(true)

      // Obtener datos actualizados del usuario desde la BD
      const fetchUserData = async () => {
        try {
          const response = await axios.post(
            API_URL,
            {
              query: `
                query Me {
                  me {
                    id
                    name
                    email
                    role
                    emailNotifications
                  }
                }
              `
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (response.data.data?.me) {
            const updatedUser = response.data.data.me;
            setUser(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));
          } else {
            // Si falla la query, usar datos guardados
            setUser(JSON.parse(savedUser));
          }
        } catch (error) {
          console.error('Error al obtener datos del usuario:', error);

          // Si el error es de autenticación (token expirado o inválido), hacer logout
          const isAuthError =
            error.response?.status === 401 ||
            error.response?.status === 403 ||
            error.response?.data?.errors?.[0]?.message?.toLowerCase().includes('no autenticado') ||
            error.response?.data?.errors?.[0]?.message?.toLowerCase().includes('autenticado');

          if (isAuthError) {
            console.warn('⚠️ Token expirado o inválido. Cerrando sesión...');
            handleLogout();
            return;
          }

          // Si es otro tipo de error, usar datos guardados
          setUser(JSON.parse(savedUser));
        }
      };

      fetchUserData();
    }
  }, [])

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setIsAuthenticated(true)
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setIsAuthenticated(false)
    setUser(null)
  }

  // Monitorear el estado del servidor y desloguear si se detecta un reinicio
  useServerHealth(() => {
    if (isAuthenticated) {
      console.log('🔄 Servidor reiniciado detectado. Cerrando sesión silenciosamente...');
      handleLogout();
    }
  }, 30000); // Verificar cada 30 segundos

  // Auto-logout basado en expiración del JWT (8 horas)
  useEffect(() => {
    if (!isAuthenticated) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    // Verificar si ya expiró
    if (isTokenExpired(token)) {
      console.log('⏰ Token JWT expirado. Cerrando sesión silenciosamente...');
      handleLogout();
      return;
    }

    // Obtener tiempo restante en milisegundos
    const remainingSeconds = getTokenTimeRemaining(token);
    const remainingMs = remainingSeconds * 1000;

    console.log(`⏰ Sesión expirará en ${Math.floor(remainingSeconds / 60)} minutos`);

    // Programar logout exacto cuando expire el JWT
    const timeoutId = setTimeout(() => {
      console.log('⏰ Sesión expirada (8 horas). Cerrando sesión silenciosamente...');
      handleLogout();
    }, remainingMs);

    // Verificar al volver a la pestaña (por si el usuario cerró el navegador)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentToken = localStorage.getItem('token');
        if (currentToken && isTokenExpired(currentToken)) {
          console.log('⏰ Token expirado detectado al regresar. Cerrando sesión...');
          handleLogout();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]);

  // Interceptor de Axios para detectar tokens expirados (401/403)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const isAuthError =
          error.response?.status === 401 ||
          error.response?.status === 403 ||
          error.response?.data?.errors?.[0]?.message?.toLowerCase().includes('no autenticado');

        if (isAuthError && isAuthenticated) {
          console.log('🔒 Token expirado detectado por el servidor. Cerrando sesión silenciosamente...');
          handleLogout();
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [isAuthenticated]);

  return (
    <>
      {!isAuthenticated ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Dashboard user={user} onLogout={handleLogout} />
      )}
    </>
  )
}

export default App
