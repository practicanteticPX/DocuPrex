import { useState } from 'react';
import axios from 'axios';
import './Login.css';
import { API_URL } from '../../config/api';
import docuprexLogo from '../../assets/docuprex.png';

// Log para debug
console.log('🔗 Login - Backend URL:', API_URL);

function Login({ onLogin }) {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Limpiar error cuando el usuario escribe
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // GraphQL mutation para login
      const query = `
        mutation Login($email: String!, $password: String!) {
          login(email: $email, password: $password) {
            token
            user {
              id
              name
              email
              role
              emailNotifications
            }
          }
        }
      `;

      const response = await axios.post(API_URL, {
        query,
        variables: {
          email: formData.username,
          password: formData.password
        }
      }, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        }
      });

      // Verificar si hay errores de GraphQL y mejorar logging para debug
      if (response.data.errors) {
        console.error('GraphQL errors from server:', response.data.errors);
        // Mostrar el mensaje del primer error al usuario
        const msg = response.data.errors[0]?.message || 'Error en autenticación (GraphQL)';
        throw new Error(msg);
      }

      // Verificar que la respuesta tenga la estructura esperada
      if (!response.data || !response.data.data || !response.data.data.login) {
        console.error('Unexpected GraphQL response:', response.data);
        throw new Error('Respuesta inesperada del servidor. Revisa la consola para más detalles.');
      }

      const { token, user } = response.data.data.login;

      // Llamar a la función de login del componente padre
      onLogin(token, user);

    } catch (err) {
      console.error('Error en login:', err);
      setError(
        err.message ||
        err.response?.data?.message ||
        'Error al iniciar sesión. Por favor, verifica tus credenciales.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-container">
            <img src={docuprexLogo} alt="Docuprex" className="logo-image" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-message">
                <span>{error}</span>
              </div>
            )}

            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Usuario"
              required
              autoComplete="username"
              className="form-input"
            />

            <div className="input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Contraseña"
                required
                autoComplete="current-password"
                className="form-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>

            <button type="submit" className="submit-button">
              Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
