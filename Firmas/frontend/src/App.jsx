import { useState, useEffect } from 'react'
import Login from './components/login/Login.jsx'
import Dashboard from './components/dashboard/Dashboard.jsx'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)

  // Verificar si hay una sesión guardada al cargar la app
  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')

    if (token && savedUser) {
      setIsAuthenticated(true)
      setUser(JSON.parse(savedUser))
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
