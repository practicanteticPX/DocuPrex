/**
 * Script de prueba para el sistema de recordatorios
 * Ejecutar con: node server/scripts/test-reminders.js
 */

const { sendPendingSignatureReminders } = require('../services/signatureReminders');

console.log('🧪 Iniciando prueba del sistema de recordatorios...\n');

sendPendingSignatureReminders()
  .then(result => {
    console.log('\n✅ Prueba completada exitosamente');
    console.log('📊 Resultados:');
    console.log(`   - Recordatorios enviados: ${result.sent}`);
    console.log(`   - Fallos: ${result.failed}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error durante la prueba:', error);
    process.exit(1);
  });
