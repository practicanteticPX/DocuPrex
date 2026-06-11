const { query } = require('../database/db');
const path = require('path');
const { addCoverPageWithSigners, updateSignersPage } = require('../utils/pdfCoverPage');
const fs = require('fs').promises;

async function regenerateSignerReports() {
  try {
    console.log('🔄 Starting signer reports regeneration...\n');

    const documentsResult = await query(`
      SELECT d.id, d.title, d.file_path, d.file_name, d.created_at, d.uploaded_by,
             d.document_type_id, d.metadata, dt.code as document_type_code
      FROM documents d
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      WHERE d.status IN ('in_progress', 'pending', 'completed', 'rejected')
      ORDER BY d.id ASC
    `);

    const documents = documentsResult.rows;
    console.log(`📋 Found ${documents.length} document(s) to process\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Check which optional columns exist
    const colCheck = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'signatures'
        AND column_name IN ('consecutivo', 'real_signer_name', 'document_signer_id')
    `);
    const existingCols = new Set(colCheck.rows.map(r => r.column_name));
    const hasConsecutivo = existingCols.has('consecutivo');
    const hasRealSignerName = existingCols.has('real_signer_name');
    const hasDocumentSignerId = existingCols.has('document_signer_id');
    console.log(`📋 signatures columns: consecutivo=${hasConsecutivo} realSignerName=${hasRealSignerName} documentSignerId=${hasDocumentSignerId}`);

    const consecutivoSelect = hasConsecutivo ? 's.consecutivo' : 'NULL as consecutivo';
    const realSignerNameSelect = hasRealSignerName ? 's.real_signer_name' : 'NULL as real_signer_name';
    const signatureJoin = hasDocumentSignerId
      ? `s.document_id = ds.document_id AND (
          (ds.is_causacion_group = false AND s.document_signer_id = ds.id) OR
          (ds.is_causacion_group = true AND s.document_signer_id = ds.id)
        )`
      : `s.document_id = ds.document_id AND (
          (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
          (ds.is_causacion_group = true AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg2 ON ci.grupo_id = cg2.id
            WHERE cg2.codigo = ds.grupo_codigo
          ))
        )`;

    for (const doc of documents) {
      console.log(`\n📄 Processing document ${doc.id}: "${doc.title}"`);

      // Skip FV documents with metadata — require full template merge to regenerate correctly
      if (doc.document_type_code === 'FV' && doc.metadata) {
        console.log(`   ⏭️  Skipping: FV with template metadata (requires full merge)`);
        skippedCount++;
        continue;
      }

      try {
        const signersResult = await query(
          `SELECT
            ds.user_id,
            ds.order_position,
            ds.role_name,
            ds.role_names,
            ds.is_causacion_group,
            ds.grupo_codigo,
            u.name as user_name,
            u.email,
            cg.nombre as grupo_nombre,
            COALESCE(s.status, 'pending') as status,
            s.signed_at,
            s.rejected_at,
            s.rejection_reason,
            ${consecutivoSelect},
            ${realSignerNameSelect},
            signer_user.email as signer_email,
            NULL as retention_percentage,
            NULL as retention_reason,
            NULL as retained_at
          FROM document_signers ds
          LEFT JOIN users u ON ds.user_id = u.id
          LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
          LEFT JOIN signatures s ON ${signatureJoin}
          LEFT JOIN users signer_user ON s.signer_id = signer_user.id
          WHERE ds.document_id = $1
          ORDER BY ds.order_position ASC`,
          [doc.id]
        );

        const signers = signersResult.rows.map(row => ({
          name: row.is_causacion_group
            ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
            : (row.user_name || 'Sin nombre'),
          email: row.signer_email || row.email,
          order_position: row.order_position,
          role_name: row.role_name,
          role_names: row.role_names,
          status: row.status,
          signed_at: row.signed_at,
          rejected_at: row.rejected_at,
          rejection_reason: row.rejection_reason,
          consecutivo: row.consecutivo,
          is_causacion_group: row.is_causacion_group,
          grupo_codigo: row.grupo_codigo,
          real_signer_name: row.real_signer_name,
          retention_percentage: row.retention_percentage,
          retention_reason: row.retention_reason,
          retained_at: row.retained_at
        }));

        if (signers.length === 0) {
          console.log(`   ⏭️  Skipping: No signers assigned`);
          skippedCount++;
          continue;
        }

        const pdfPath = path.join(__dirname, '..', doc.file_path);

        try {
          await fs.access(pdfPath);
        } catch (err) {
          console.log(`   ⚠️  Skipping: PDF file not found at ${pdfPath}`);
          skippedCount++;
          continue;
        }

        const uploaderResult = await query('SELECT name FROM users WHERE id = $1', [doc.uploaded_by]);
        const uploaderName = uploaderResult.rows.length > 0 ? uploaderResult.rows[0].name : 'Sistema';

        const docTypeResult = await query('SELECT name FROM document_types WHERE id = $1', [doc.document_type_id]);
        const docTypeName = docTypeResult.rows.length > 0 ? docTypeResult.rows[0].name : null;

        const sentAtResult = await query(
          `SELECT MIN(created_at) as sent_at FROM document_signers WHERE document_id = $1`,
          [doc.id]
        );

        const documentInfo = {
          title: doc.title,
          fileName: doc.file_name,
          createdAt: doc.created_at,
          sentAt: sentAtResult.rows[0]?.sent_at || null,
          uploadedBy: uploaderName,
          documentTypeName: docTypeName
        };

        try {
          const pdfBytes = await fs.readFile(pdfPath);
          const PDFDocument = require('pdf-lib').PDFDocument;
          const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

          const subject = pdfDoc.getSubject();
          const hasSignerPages = subject && subject.includes('SignerPages:');

          if (hasSignerPages) {
            console.log(`   🔄 Updating existing signer pages...`);
            await updateSignersPage(pdfPath, signers, documentInfo);
          } else {
            console.log(`   📋 Adding new signer pages...`);
            await addCoverPageWithSigners(pdfPath, signers, documentInfo);
          }

          console.log(`   ✅ Success: Signer report ${hasSignerPages ? 'updated' : 'added'}`);
          successCount++;
        } catch (pdfError) {
          console.error(`   ❌ Error processing PDF: ${pdfError.message}`);
          errorCount++;
        }
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   📋 Total: ${documents.length}`);
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

regenerateSignerReports();
