import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * Hook personalizado para usar el AuthContext
 * Proporciona acceso a todas las funciones y estado de autenticación
 *
 * @example
 * const { user, login, logout, isAuthenticated } = useAuth();
 */
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
