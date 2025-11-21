const { query } = require('../database/db');
const fs = require('fs').promises;
const path = require('path');

/**
 * Limpia documentos antiguos (mayores a 3 meses)
 * Elimina:
 * - El documento de la base de datos
 * - Todas las firmas asociadas
 * - Todas las notificaciones asociadas
 * - Los archivos físicos del servidor
 */
async function cleanupOldDocuments() {
  try {
    console.log('🧹 Iniciando limpieza de documentos antiguos (>3 meses)...');

    // Primero, obtener los documentos que se van a eliminar para borrar los archivos físicos
    const documentsToDelete = await query(
      `SELECT id, file_path, title, created_at
       FROM documents
       WHERE created_at < NOW() - INTERVAL '3 months'`,
      []
    );

    if (documentsToDelete.rowCount === 0) {
      console.log('✅ No hay documentos antiguos para eliminar');
      return {
        documentsDeleted: 0,
        signaturesDeleted: 0,
        notificationsDeleted: 0,
        filesDeleted: 0
      };
    }

    const documentIds = documentsToDelete.rows.map(doc => doc.id);
    console.log(`📄 Encontrados ${documentIds.length} documentos para eliminar`);

    // Iniciar transacción para asegurar consistencia
    await query('BEGIN');

    try {
      // 1. Eliminar notificaciones asociadas a estos documentos
      const notificationsResult = await query(
        `DELETE FROM notifications
         WHERE document_id = ANY($1::uuid[])
         RETURNING id`,
        [documentIds]
      );
      const notificationsDeleted = notificationsResult.rowCount;
      console.log(`  🔔 Eliminadas ${notificationsDeleted} notificaciones`);

      // 2. Eliminar firmas asociadas a estos documentos
      const signaturesResult = await query(
        `DELETE FROM signatures
         WHERE document_id = ANY($1::uuid[])
         RETURNING id`,
        [documentIds]
      );
      const signaturesDeleted = signaturesResult.rowCount;
      console.log(`  ✍️  Eliminadas ${signaturesDeleted} firmas`);

      // 3. Eliminar asignaciones de firmantes
      const signersResult = await query(
        `DELETE FROM document_signers
         WHERE document_id = ANY($1::uuid[])
         RETURNING document_id`,
        [documentIds]
      );
      console.log(`  👥 Eliminadas ${signersResult.rowCount} asignaciones de firmantes`);

      // 4. Eliminar los documentos
      const documentsResult = await query(
        `DELETE FROM documents
         WHERE id = ANY($1::uuid[])
         RETURNING id`,
        [documentIds]
      );
      const documentsDeleted = documentsResult.rowCount;
      console.log(`  📄 Eliminados ${documentsDeleted} documentos de la base de datos`);

      // Commit de la transacción
      await query('COMMIT');

      // 5. Eliminar archivos físicos (fuera de la transacción)
      let filesDeleted = 0;
      for (const doc of documentsToDelete.rows) {
        try {
          const filePath = path.resolve(doc.file_path);
          await fs.unlink(filePath);
          filesDeleted++;
          console.log(`    🗑️  Archivo eliminado: ${doc.title}`);
        } catch (fileError) {
          // Si el archivo no existe o hay error, continuar
          console.warn(`    ⚠️  No se pudo eliminar archivo: ${doc.title} - ${fileError.message}`);
        }
      }

      const summary = {
        documentsDeleted,
        signaturesDeleted,
        notificationsDeleted,
        filesDeleted
      };

      console.log('\n✅ Limpieza completada exitosamente:');
      console.log(`   📄 Documentos eliminados: ${documentsDeleted}`);
      console.log(`   ✍️  Firmas eliminadas: ${signaturesDeleted}`);
      console.log(`   🔔 Notificaciones eliminadas: ${notificationsDeleted}`);
      console.log(`   📁 Archivos físicos eliminados: ${filesDeleted}`);

      return summary;

    } catch (error) {
      // Rollback en caso de error
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('❌ Error al limpiar documentos antiguos:', error);
    throw error;
  }
}

/**
 * Inicia el servicio de limpieza automática de documentos
 * Ejecuta la limpieza cada 24 horas (a las 3:00 AM)
 */
function startDocumentCleanupService() {
  // Calcular milisegundos hasta las 3:00 AM del próximo día
  const now = new Date();
  const nextRun = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // Siguiente día
    3, // 3:00 AM
    0, // 0 minutos
    0 // 0 segundos
  );

  const msUntilNextRun = nextRun.getTime() - now.getTime();

  console.log(`⏰ Limpieza automática de documentos programada para: ${nextRun.toLocaleString()}`);

  // Programar primera ejecución
  setTimeout(() => {
    // Ejecutar la primera limpieza
    cleanupOldDocuments().catch(console.error);

    // Luego ejecutar cada 24 horas
    setInterval(() => {
      cleanupOldDocuments().catch(console.error);
    }, 24 * 60 * 60 * 1000); // 24 horas
  }, msUntilNextRun);
}

/**
 * Ejecuta limpieza inmediata (útil para testing o ejecución manual)
 */
async function runDocumentCleanupNow() {
  console.log('🧹 Ejecutando limpieza manual de documentos antiguos...');
  return await cleanupOldDocuments();
}

/**
 * Obtiene estadísticas de documentos que serían eliminados
 * Sin realizar la eliminación
 */
async function getCleanupPreview() {
  try {
    const result = await query(
      `SELECT
         COUNT(d.id) as documents_count,
         COUNT(s.id) as signatures_count,
         COUNT(n.id) as notifications_count,
         MIN(d.created_at) as oldest_document,
         MAX(d.created_at) as newest_document_to_delete
       FROM documents d
       LEFT JOIN signatures s ON d.id = s.document_id
       LEFT JOIN notifications n ON d.id = n.document_id
       WHERE d.created_at < NOW() - INTERVAL '3 months'`,
      []
    );

    return result.rows[0];
  } catch (error) {
    console.error('❌ Error al obtener vista previa de limpieza:', error);
    throw error;
  }
}

module.exports = {
  cleanupOldDocuments,
  startDocumentCleanupService,
  runDocumentCleanupNow,
  getCleanupPreview
};
