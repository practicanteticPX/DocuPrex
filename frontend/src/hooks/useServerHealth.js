import { useEffect, useRef } from 'react';
import axios from 'axios';
import { BACKEND_HOST } from '../config/api';

/**
 * Hook para monitorear el estado del servidor y detectar reinicios
 *
 * Verifica periódicamente el timestamp de inicio del servidor.
 * Si detecta que el servidor se reinició, ejecuta el callback de logout.
 *
 * @param {Function} onServerRestart - Callback a ejecutar cuando se detecta un reinicio
 * @param {number} checkInterval - Intervalo de verificación en milisegundos (default: 30000 = 30 segundos)
 */
export const useServerHealth = (onServerRestart, checkInterval = 30000) => {
  const serverStartTimeRef = useRef(null);
  const isCheckingRef = useRef(false);

  useEffect(() => {
    const HEALTH_ENDPOINT = `${BACKEND_HOST}/api/health`;

    const checkServerHealth = async () => {
      // Evitar verificaciones concurrentes
      if (isCheckingRef.current) return;

      try {
        isCheckingRef.current = true;
        const response = await axios.get(HEALTH_ENDPOINT, {
          timeout: 5000 // 5 segundos de timeout
        });

        const { serverStartTime } = response.data;

        // Primera vez que se obtiene el tiempo de inicio
        if (serverStartTimeRef.current === null) {
          serverStartTimeRef.current = serverStartTime;
          console.log('✓ Conexión con servidor establecida. Start time:', new Date(serverStartTime).toLocaleString());
          return;
        }

        // Verificar si el servidor se reinició
        if (serverStartTime !== serverStartTimeRef.current) {
          console.warn('⚠️  Servidor reiniciado detectado!');
          console.warn('   - Tiempo anterior:', new Date(serverStartTimeRef.current).toLocaleString());
          console.warn('   - Tiempo nuevo:', new Date(serverStartTime).toLocaleString());

          // Ejecutar callback de reinicio
          if (onServerRestart && typeof onServerRestart === 'function') {
            onServerRestart();
          }

          // Actualizar la referencia para futuras verificaciones
          serverStartTimeRef.current = serverStartTime;
        }
      } catch (error) {
        // Solo logear errores si no es un error de red temporal
        if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK') {
          console.error('Error al verificar salud del servidor:', error.message);
        }
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Verificación inicial
    checkServerHealth();

    // Configurar verificación periódica
    const interval = setInterval(checkServerHealth, checkInterval);

    // Cleanup al desmontar
    return () => {
      clearInterval(interval);
      serverStartTimeRef.current = null;
      isCheckingRef.current = false;
    };
  }, [onServerRestart, checkInterval]);
};
