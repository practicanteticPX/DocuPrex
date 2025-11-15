import { createContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS, ERROR_MESSAGES } from '../utils/constants';
import { getLocalStorage, setLocalStorage, removeLocalStorage, getErrorMessage, isAuthError } from '../utils/helpers';

/**
 * Context para manejo de autenticación
 * Proporciona estado y funciones relacionadas con autenticación de usuario
 */
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Estado de autenticación
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Inicializa autenticación desde localStorage
   */
  useEffect(() => {
    const initAuth = () => {
      try {
        const savedToken = getLocalStorage(STORAGE_KEYS.AUTH_TOKEN);
        const savedUser = getLocalStorage(STORAGE_KEYS.USER_DATA);

        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(savedUser);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  /**
   * Realiza login de usuario
   */
  const login = useCallback(async (credentials) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(import.meta.env.VITE_API_URL || 'http://192.168.0.30:5001/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation Login($email: String!, $password: String!) {
              login(email: $email, password: $password) {
                token
                user {
                  id
                  name
                  email
                  role
                }
              }
            }
          `,
          variables: {
            email: credentials.email,
            password: credentials.password
          }
        })
      });

      const result = await response.json();

      if (result.errors) {
        const errorMessage = getErrorMessage(result.errors[0]);
        throw new Error(errorMessage);
      }

      const { token: newToken, user: newUser } = result.data.login;

      // Guardar en estado
      setToken(newToken);
      setUser(newUser);

      // Guardar en localStorage
      setLocalStorage(STORAGE_KEYS.AUTH_TOKEN, newToken);
      setLocalStorage(STORAGE_KEYS.USER_DATA, newUser);

      return { success: true, user: newUser };
    } catch (err) {
      const errorMessage = getErrorMessage(err, ERROR_MESSAGES.AUTH_ERROR);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Realiza logout de usuario
   */
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setError(null);

    removeLocalStorage(STORAGE_KEYS.AUTH_TOKEN);
    removeLocalStorage(STORAGE_KEYS.USER_DATA);
  }, []);

  /**
   * Actualiza datos del usuario
   */
  const updateUser = useCallback((updates) => {
    setUser(prevUser => {
      const updatedUser = { ...prevUser, ...updates };
      setLocalStorage(STORAGE_KEYS.USER_DATA, updatedUser);
      return updatedUser;
    });
  }, []);

  /**
   * Verifica si el usuario está autenticado
   */
  const isAuthenticated = useCallback(() => {
    return !!user && !!token;
  }, [user, token]);

  /**
   * Verifica si el usuario tiene un rol específico
   */
  const hasRole = useCallback((role) => {
    return user?.role === role;
  }, [user]);

  /**
   * Verifica si el usuario es administrador
   */
  const isAdmin = useCallback(() => {
    return user?.role === 'admin';
  }, [user]);

  /**
   * Maneja errores de autenticación
   */
  const handleAuthError = useCallback((err) => {
    if (isAuthError(err)) {
      logout();
      return true;
    }
    return false;
  }, [logout]);

  /**
   * Limpia errores
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    // Estado
    user,
    token,
    loading,
    error,
    isAuthenticated: isAuthenticated(),

    // Funciones
    login,
    logout,
    updateUser,
    hasRole,
    isAdmin,
    handleAuthError,
    clearError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
