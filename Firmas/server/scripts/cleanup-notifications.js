/**
 * Script para ejecutar limpieza manual de notificaciones antiguas
 *
 * Uso:
 *   node scripts/cleanup-notifications.js
 */

require('dotenv').config();
const { runCleanupNow } = require('../services/notificationCleanup');

async function main() {
  console.log('========================================');
  console.log('  Limpieza Manual de Notificaciones');
  console.log('========================================\n');

  try {
    const deletedCount = await runCleanupNow();

    console.log('\n========================================');
    console.log(`  Total eliminadas: ${deletedCount}`);
    console.log('========================================');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante la limpieza:', error.message);
    process.exit(1);
  }
}

main();
