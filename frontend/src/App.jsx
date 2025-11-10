import { useState, useEffect } from 'react'
import axios from 'axios'
import Login from './components/login/Login.jsx'
import Dashboard from './components/dashboard/Dashboard.jsx'
import './App.css'

// Determinar el host del backend
const getBackendHost = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:5001`;
};

const BACKEND_HOST = getBackendHost();
const API_URL = `${BACKEND_HOST}/graphql`;

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
          // Si falla, usar datos guardados
          setUser(JSON.parse(savedUser));
        }
      };

      fetchUserData();
    }
  }, [])

  const handleLogin = (token, userData) => {
    // Guardar el token en localStorage
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
