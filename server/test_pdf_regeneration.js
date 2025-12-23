const { query } = require('./database/db');
const { generateFacturaTemplatePDF } = require('./utils/pdfFacturaTemplate');
const fs = require('fs').promises;
const path = require('path');

async function obtenerFirmasDocumento(documentId, templateData) {
  try {
    const result = await query(
      `SELECT
        ds.user_id,
        u.name as user_name,
        u.email,
        s.real_signer_name,
        s.status as signature_status,
        ds.role_names,
        ds.role_name
       FROM document_signers ds
       JOIN users u ON u.id = ds.user_id
       LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
       WHERE ds.document_id = $1
         AND ds.is_causacion_group = FALSE
         AND s.status = 'signed'
       ORDER BY ds.order_position ASC`,
      [documentId]
    );

    const firmas = {};
    result.rows.forEach(row => {
      const nombreFirmante = row.real_signer_name || row.user_name;
      firmas[row.user_name] = nombreFirmante;

      if (templateData && templateData.nombreNegociador === row.user_name) {
        firmas[templateData.nombreNegociador] = nombreFirmante;
      }

      if (templateData && templateData.filasControl) {
        templateData.filasControl.forEach(fila => {
          if (fila.respCuentaContable === row.user_name) {
            firmas[fila.respCuentaContable] = nombreFirmante;
          }
          if (fila.respCentroCostos === row.user_name) {
            firmas[fila.respCentroCostos] = nombreFirmante;
          }
        });
      }
    });

    return firmas;
  } catch (error) {
    console.error('❌ Error al obtener firmas:', error);
    return {};
  }
}

async function testPDFRegeneration() {
  try {
    console.log('🧪 Iniciando test de regeneración de PDF...\n');

    const documentId = 181;

    // Obtener documento
    const docResult = await query(
      `SELECT d.id, d.title, d.metadata, d.retention_data
       FROM documents d
       WHERE d.id = $1`,
      [documentId]
    );

    if (docResult.rows.length === 0) {
      throw new Error('Documento no encontrado');
    }

    const docInfo = docResult.rows[0];
    console.log('📄 Documento:', docInfo.title);
    console.log('📦 retention_data RAW:', docInfo.retention_data);

    const templateData = typeof docInfo.metadata === 'string'
      ? JSON.parse(docInfo.metadata)
      : docInfo.metadata;

    console.log('📋 Template data tiene', templateData.filasControl?.length || 0, 'filas de control');

    // Obtener firmas
    const firmasActuales = await obtenerFirmasDocumento(documentId, templateData);
    console.log('✍️ Firmas encontradas:', Object.keys(firmasActuales));

    // Obtener retenciones activas
    const retentionData = docInfo.retention_data
      ? (typeof docInfo.retention_data === 'string' ? JSON.parse(docInfo.retention_data) : docInfo.retention_data).filter(r => r.activa)
      : [];

    console.log('\n📊 Retenciones activas a pasar al PDF:', retentionData);
    console.log('📊 Cantidad de retenciones activas:', retentionData.length);

    if (retentionData.length > 0) {
      retentionData.forEach((ret, idx) => {
        console.log(`  ${idx + 1}. Usuario: ${ret.userName}, Centro: ${ret.centroCostoIndex}, %: ${ret.porcentajeRetenido}%, Motivo: ${ret.motivo}`);
      });
    }

    console.log('\n🔄 Generando PDF...\n');

    // Generar PDF
    const templatePdfBuffer = await generateFacturaTemplatePDF(templateData, firmasActuales, false, retentionData);

    // Guardar PDF de prueba
    const testPdfPath = path.join(__dirname, 'uploads', 'temp', `test_pdf_${documentId}_${Date.now()}.pdf`);
    await fs.mkdir(path.dirname(testPdfPath), { recursive: true });
    await fs.writeFile(testPdfPath, templatePdfBuffer);

    console.log('\n✅ PDF generado exitosamente:', testPdfPath);
    console.log('📏 Tamaño del PDF:', (templatePdfBuffer.length / 1024).toFixed(2), 'KB');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error en el test:', error);
    process.exit(1);
  }
}

testPDFRegeneration();
