const { query } = require('../database/db');
const path = require('path');
const { addCoverPageWithSigners, updateSignersPage } = require('../utils/pdfCoverPage');
const fs = require('fs').promises;

/**
 * Script to regenerate signer reports for all existing documents
 * Run after adding consecutivo and real_signer_name columns to signatures table
 */
async function regenerateSignerReports() {
  try {
    console.log('🔄 Starting signer reports regeneration...\n');

    const documentsResult = await query(`
      SELECT d.id, d.title, d.file_path, d.file_name, d.created_at, d.uploaded_by, d.document_type_id
      FROM documents d
      WHERE d.status IN ('in_progress', 'pending', 'completed', 'rejected')
      ORDER BY d.id ASC
    `);

    const documents = documentsResult.rows;
    console.log(`📋 Found ${documents.length} document(s) to process\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const doc of documents) {
      console.log(`\n📄 Processing document ${doc.id}: "${doc.title}"`);

      try {
        const signersResult = await query(
          `SELECT ds.user_id, u.id, u.name, u.email, ds.order_position, ds.role_name, ds.role_names,
                  COALESCE(s.status, 'pending') as status,
                  s.signed_at,
                  s.rejected_at,
                  s.rejection_reason,
                  s.consecutivo,
                  s.real_signer_name
          FROM document_signers ds
          JOIN users u ON ds.user_id = u.id
          LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
          WHERE ds.document_id = $1
          ORDER BY ds.order_position ASC`,
          [doc.id]
        );

        const signers = signersResult.rows;

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

        const documentInfo = {
          title: doc.title,
          fileName: doc.file_name,
          createdAt: doc.created_at,
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
