/**
 * Script para ejecutar limpieza manual de documentos antiguos (>3 meses)
 *
 * Este script elimina documentos con más de 3 meses de antigüedad junto con:
 * - Todas sus firmas
 * - Todas las notificaciones asociadas
 * - Los archivos físicos del servidor
 *
 * Uso:
 *   # Ver qué se eliminaría (preview)
 *   node scripts/cleanup-documents.js --preview
 *
 *   # Ejecutar limpieza
 *   node scripts/cleanup-documents.js
 *
 *   # Forzar limpieza sin confirmación
 *   node scripts/cleanup-documents.js --force
 */

require('dotenv').config();
const readline = require('readline');
const { runDocumentCleanupNow, getCleanupPreview } = require('../services/documentCleanup');

// Configurar readline para confirmación del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function showPreview() {
  console.log('========================================');
  console.log('  Vista Previa de Limpieza');
  console.log('========================================\n');

  try {
    const preview = await getCleanupPreview();

    console.log('📊 Documentos que serían eliminados:');
    console.log(`   📄 Total documentos: ${preview.documents_count}`);
    console.log(`   ✍️  Total firmas: ${preview.signatures_count}`);
    console.log(`   🔔 Total notificaciones: ${preview.notifications_count}`);

    if (preview.oldest_document) {
      console.log(`\n📅 Rango de fechas:`);
      console.log(`   Documento más antiguo: ${new Date(preview.oldest_document).toLocaleDateString()}`);
      console.log(`   Documento más reciente a eliminar: ${new Date(preview.newest_document_to_delete).toLocaleDateString()}`);
    }

    console.log('\n========================================\n');
    return parseInt(preview.documents_count);
  } catch (error) {
    console.error('\n❌ Error al obtener vista previa:', error.message);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isPreview = args.includes('--preview');
  const isForce = args.includes('--force');

  console.log('========================================');
  console.log('  Limpieza de Documentos Antiguos');
  console.log('  (>3 meses)');
  console.log('========================================\n');

  try {
    // Siempre mostrar preview primero
    const documentCount = await showPreview();

    // Si es solo preview, salir
    if (isPreview) {
      console.log('ℹ️  Modo preview - No se realizaron cambios');
      rl.close();
      process.exit(0);
    }

    // Si no hay documentos para eliminar, salir
    if (documentCount === 0) {
      console.log('✅ No hay documentos para eliminar');
      rl.close();
      process.exit(0);
    }

    // Pedir confirmación si no es modo --force
    if (!isForce) {
      console.log('⚠️  ADVERTENCIA: Esta acción no se puede deshacer.\n');
      const answer = await askQuestion('¿Desea continuar con la eliminación? (sí/no): ');

      if (answer.toLowerCase() !== 'sí' && answer.toLowerCase() !== 'si') {
        console.log('\n❌ Operación cancelada por el usuario');
        rl.close();
        process.exit(0);
      }
    }

    console.log('\n🚀 Iniciando limpieza...\n');

    // Ejecutar limpieza
    const result = await runDocumentCleanupNow();

    console.log('\n========================================');
    console.log('  Resumen de Limpieza');
    console.log('========================================');
    console.log(`  📄 Documentos eliminados: ${result.documentsDeleted}`);
    console.log(`  ✍️  Firmas eliminadas: ${result.signaturesDeleted}`);
    console.log(`  🔔 Notificaciones eliminadas: ${result.notificationsDeleted}`);
    console.log(`  📁 Archivos eliminados: ${result.filesDeleted}`);
    console.log('========================================\n');

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante la limpieza:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();
