const { query } = require('../database/db');

/**
 * Limpia notificaciones antiguas (mayores a 3 días) de tipos específicos
 * Solo elimina notificaciones de tipo 'document_completed' y 'document_rejected'
 */
async function cleanupOldNotifications() {
  try {
    console.log('🧹 Iniciando limpieza de notificaciones antiguas...');

    // Eliminar notificaciones de documento completado y rechazado mayores a 3 días
    const result = await query(
      `DELETE FROM notifications
       WHERE type IN ('document_completed', 'document_rejected')
       AND created_at < NOW() - INTERVAL '3 days'
       RETURNING id`,
      []
    );

    const deletedCount = result.rowCount;

    if (deletedCount > 0) {
      console.log(`✅ Se eliminaron ${deletedCount} notificaciones antiguas`);
    } else {
      console.log('✅ No hay notificaciones antiguas para eliminar');
    }

    return deletedCount;
  } catch (error) {
    console.error('❌ Error al limpiar notificaciones antiguas:', error);
    throw error;
  }
}

/**
 * Inicia el servicio de limpieza automática
 * Ejecuta la limpieza cada 24 horas (a las 2:00 AM)
 */
function startCleanupService() {
  // Calcular milisegundos hasta las 2:00 AM del próximo día
  const now = new Date();
  const nextRun = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // Siguiente día
    2, // 2:00 AM
    0, // 0 minutos
    0 // 0 segundos
  );

  const msUntilNextRun = nextRun.getTime() - now.getTime();

  console.log(`⏰ Limpieza automática de notificaciones programada para: ${nextRun.toLocaleString()}`);

  // Programar primera ejecución
  setTimeout(() => {
    // Ejecutar la primera limpieza
    cleanupOldNotifications().catch(console.error);

    // Luego ejecutar cada 24 horas
    setInterval(() => {
      cleanupOldNotifications().catch(console.error);
    }, 24 * 60 * 60 * 1000); // 24 horas
  }, msUntilNextRun);
}

/**
 * Ejecuta limpieza inmediata (útil para testing o ejecución manual)
 */
async function runCleanupNow() {
  console.log('🧹 Ejecutando limpieza manual de notificaciones...');
  return await cleanupOldNotifications();
}

module.exports = {
  cleanupOldNotifications,
  startCleanupService,
  runCleanupNow
};
