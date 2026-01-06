const { cleanupExpiredSessions } = require('../utils/sessionManager');

/**
 * Servicio de limpieza automática de sesiones expiradas
 * Se ejecuta cada 1 hora para limpiar sesiones que hayan pasado las 8 horas
 */
function startSessionCleanupService() {
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hora en milisegundos

  // Ejecutar inmediatamente al iniciar el servidor
  cleanupExpiredSessions()
    .then(count => {
      console.log(`🧹 Limpieza inicial: ${count} sesiones expiradas marcadas como inactivas`);
    })
    .catch(err => {
      console.error('❌ Error en limpieza inicial de sesiones:', err);
    });

  // Programar ejecución cada 1 hora
  setInterval(async () => {
    try {
      const count = await cleanupExpiredSessions();
      console.log(`🧹 Limpieza automática: ${count} sesiones expiradas marcadas como inactivas`);
    } catch (error) {
      console.error('❌ Error en limpieza automática de sesiones:', error);
    }
  }, CLEANUP_INTERVAL);

  console.log('🧹 Servicio de limpieza de sesiones iniciado (cada 1 hora)');
}

module.exports = { startSessionCleanupService };
