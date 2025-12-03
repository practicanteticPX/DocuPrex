import { useState, useEffect } from 'react';
import { BACKEND_HOST } from '../config/api';

/**
 * Hook para cargar y gestionar centros de costos
 * Consulta la tabla T_CentrosCostos desde SERV_QPREX
 */
export const useCentrosCostos = () => {
  const [centros, setCentros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCentrosCostos = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${BACKEND_HOST}/api/facturas/centros-costos`);
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || 'Error al cargar centros de costos');
        }

        setCentros(result.data || []);
      } catch (err) {
        console.error('Error cargando centros de costos:', err);
        setError(err.message);
        setCentros([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCentrosCostos();
  }, []);

  const getCentroData = (codigo) => {
    return centros.find(c => c.codigo === codigo) || null;
  };

  const validarResponsable = async (nombre) => {
    try {
      const response = await fetch(`${BACKEND_HOST}/api/facturas/validar-responsable/${encodeURIComponent(nombre)}`);
      const result = await response.json();

      if (!result.success) {
        return null;
      }

      return result.data;
    } catch (err) {
      console.error('Error validando responsable:', err);
      return null;
    }
  };

  return {
    centros,
    loading,
    error,
    getCentroData,
    validarResponsable
  };
};
