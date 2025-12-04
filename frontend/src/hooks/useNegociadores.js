import { useState, useEffect } from 'react';
import { BACKEND_HOST } from '../config/api';

/**
 * Hook para cargar y gestionar negociadores
 * Consulta la tabla T_Negociadores desde SERV_QPREX.crud_facturas
 */
export const useNegociadores = () => {
  const [negociadores, setNegociadores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNegociadores = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${BACKEND_HOST}/api/facturas/negociadores`);
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || 'Error al cargar negociadores');
        }

        setNegociadores(result.data || []);
      } catch (err) {
        console.error('Error cargando negociadores:', err);
        setError(err.message);
        setNegociadores([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNegociadores();
  }, []);

  const getNegociadorData = (nombre) => {
    return negociadores.find(n => n.negociador === nombre) || null;
  };

  return {
    negociadores,
    loading,
    error,
    getNegociadorData
  };
};
