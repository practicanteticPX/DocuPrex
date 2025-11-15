import { useState, useCallback, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { getErrorMessage } from '../utils/helpers';

/**
 * Hook personalizado para manejar firmantes
 * Proporciona funciones para obtener y gestionar firmantes
 */
export const useSigners = () => {
  const { token, handleAuthError } = useContext(AuthContext);

  const [availableSigners, setAvailableSigners] = useState([]);
  const [selectedSigners, setSelectedSigners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Carga los firmantes disponibles
   */
  const fetchAvailableSigners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(import.meta.env.VITE_API_URL || 'http://192.168.0.30:5001/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          query: `
            query {
              users {
                id
                name
                email
                role
              }
            }
          `
        })
      });

      const result = await response.json();

      if (result.errors) {
        const error = result.errors[0];

        if (handleAuthError(error)) {
          return [];
        }

        throw new Error(getErrorMessage(error));
      }

      setAvailableSigners(result.data.users || []);
      return result.data.users || [];
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching signers:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [token, handleAuthError]);

  /**
   * Agrega un firmante a la lista de seleccionados
   */
  const addSigner = useCallback((signer, order = null, roleCode = null) => {
    setSelectedSigners(prev => {
      // Verificar que no esté ya agregado
      if (prev.some(s => s.id === signer.id)) {
        return prev;
      }

      const newSigner = {
        ...signer,
        order_position: order !== null ? order : prev.length + 1,
        role_code: roleCode
      };

      return [...prev, newSigner];
    });
  }, []);

  /**
   * Remueve un firmante de la lista
   */
  const removeSigner = useCallback((signerId) => {
    setSelectedSigners(prev => {
      const filtered = prev.filter(s => s.id !== signerId);

      // Reordenar posiciones
      return filtered.map((s, index) => ({
        ...s,
        order_position: index + 1
      }));
    });
  }, []);

  /**
   * Actualiza el orden de un firmante
   */
  const updateSignerOrder = useCallback((signerId, newOrder) => {
    setSelectedSigners(prev => {
      return prev.map(s =>
        s.id === signerId ? { ...s, order_position: newOrder } : s
      ).sort((a, b) => a.order_position - b.order_position);
    });
  }, []);

  /**
   * Actualiza el rol de un firmante
   */
  const updateSignerRole = useCallback((signerId, roleCode) => {
    setSelectedSigners(prev =>
      prev.map(s => s.id === signerId ? { ...s, role_code: roleCode } : s)
    );
  }, []);

  /**
   * Mueve un firmante hacia arriba en el orden
   */
  const moveSignerUp = useCallback((signerId) => {
    setSelectedSigners(prev => {
      const index = prev.findIndex(s => s.id === signerId);
      if (index <= 0) return prev;

      const newSigners = [...prev];
      const temp = newSigners[index - 1].order_position;
      newSigners[index - 1].order_position = newSigners[index].order_position;
      newSigners[index].order_position = temp;

      return newSigners.sort((a, b) => a.order_position - b.order_position);
    });
  }, []);

  /**
   * Mueve un firmante hacia abajo en el orden
   */
  const moveSignerDown = useCallback((signerId) => {
    setSelectedSigners(prev => {
      const index = prev.findIndex(s => s.id === signerId);
      if (index === -1 || index >= prev.length - 1) return prev;

      const newSigners = [...prev];
      const temp = newSigners[index + 1].order_position;
      newSigners[index + 1].order_position = newSigners[index].order_position;
      newSigners[index].order_position = temp;

      return newSigners.sort((a, b) => a.order_position - b.order_position);
    });
  }, []);

  /**
   * Limpia la lista de firmantes seleccionados
   */
  const clearSelectedSigners = useCallback(() => {
    setSelectedSigners([]);
  }, []);

  /**
   * Establece la lista completa de firmantes seleccionados
   */
  const setSigners = useCallback((signers) => {
    setSelectedSigners(signers);
  }, []);

  /**
   * Limpia el error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Estado
    availableSigners,
    selectedSigners,
    loading,
    error,

    // Funciones
    fetchAvailableSigners,
    addSigner,
    removeSigner,
    updateSignerOrder,
    updateSignerRole,
    moveSignerUp,
    moveSignerDown,
    clearSelectedSigners,
    setSigners,
    clearError
  };
};
