const { Pool } = require('pg');
const { updateSignersPage } = require('../utils/pdfCoverPage');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Usar DATABASE_URL si está disponible, sino usar variables individuales
const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'postgres-db',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'firmas_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres123',
    };

const pool = new Pool(connectionConfig);

async function regenerateAllPDFs() {
  console.log('🚀 Iniciando regeneración de todos los PDFs...\n');

  try {
    // Obtener todos los documentos
    const documentsResult = await pool.query(`
      SELECT
        d.id,
        d.title,
        d.file_name,
        d.file_path,
        d.created_at,
        u.name as uploaded_by_name,
        dt.name as document_type_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      ORDER BY d.created_at DESC
    `);

    const documents = documentsResult.rows;
    console.log(`📄 Encontrados ${documents.length} documentos para regenerar\n`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      console.log(`\n[${i + 1}/${documents.length}] Procesando: "${doc.title}"`);
      console.log(`   Ruta: ${doc.file_path}`);

      try {
        // Obtener los firmantes del documento
        const signersResult = await pool.query(`
          SELECT
            u.name,
            u.email,
            ds.order_position,
            ds.role_name,
            ds.role_names,
            COALESCE(s.status, 'pending') as status,
            s.signed_at,
            s.rejected_at,
            s.rejection_reason,
            s.consecutivo,
            s.real_signer_name
          FROM document_signers ds
          JOIN users u ON ds.user_id = u.id
          LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = u.id
          WHERE ds.document_id = $1
          ORDER BY ds.order_position
        `, [doc.id]);

        const signers = signersResult.rows;

        if (signers.length === 0) {
          console.log(`   ⚠️  Sin firmantes asignados, saltando...`);
          continue;
        }

        const documentInfo = {
          title: doc.title,
          fileName: doc.file_name,
          createdAt: doc.created_at,
          uploadedBy: doc.uploaded_by_name || 'Sistema',
          documentTypeName: doc.document_type_name || null
        };

        // Actualizar la página de firmantes
        await updateSignersPage(doc.file_path, signers, documentInfo);

        successCount++;
        console.log(`   ✅ Regenerado exitosamente (${signers.length} firmantes)`);

      } catch (error) {
        errorCount++;
        console.error(`   ❌ Error al regenerar: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE REGENERACIÓN:');
    console.log('='.repeat(60));
    console.log(`✅ Exitosos: ${successCount}`);
    console.log(`❌ Errores: ${errorCount}`);
    console.log(`📄 Total: ${documents.length}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    await pool.end();
    console.log('🔌 Conexión a base de datos cerrada');
  }
}

// Ejecutar el script
regenerateAllPDFs().then(() => {
  console.log('\n✨ Proceso completado');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Error fatal:', error);
  process.exit(1);
});
