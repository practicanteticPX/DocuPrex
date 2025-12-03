import { useState, useEffect } from 'react';
import { BACKEND_HOST } from '../config/api';

/**
 * Hook para cargar y gestionar cuentas contables
 * Consulta la tabla T_Master_Responsable_Cuenta
 */
export const useCuentasContables = () => {
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCuentasContables = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${BACKEND_HOST}/api/facturas/cuentas-contables`);
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || 'Error al cargar cuentas contables');
        }

        setCuentas(result.data || []);
      } catch (err) {
        console.error('Error cargando cuentas contables:', err);
        setError(err.message);
        setCuentas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCuentasContables();
  }, []);

  const getCuentaData = (codigoCuenta) => {
    return cuentas.find(c => c.cuenta === codigoCuenta) || null;
  };

  return {
    cuentas,
    loading,
    error,
    getCuentaData
  };
};
