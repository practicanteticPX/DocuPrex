/**
 * Script para regenerar el PDF de un documento FV específico
 * Útil después de corregir el metadata
 */

const { pool, query } = require('../database/db');
const { generateFacturaTemplatePDF } = require('../utils/pdfFacturaTemplate');
const { mergePDFs } = require('../utils/pdfMerger');
const { addCoverPageWithSigners, updateSignersPage } = require('../utils/pdfCoverPage');
const path = require('path');
const fs = require('fs').promises;

/**
 * Función auxiliar para obtener firmas del documento
 */
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
    let firmaNegociaciones = null;
    let firmaCausacion = null;

    // Helper para normalizar nombres
    const normalizarNombre = (nombre) => {
      if (!nombre) return '';
      return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
    };

    // Helper para verificar si dos nombres coinciden
    const nombresCoinciden = (nombre1, nombre2) => {
      const n1 = normalizarNombre(nombre1);
      const n2 = normalizarNombre(nombre2);

      if (n1 === n2) return true;

      const words1 = n1.split(' ').filter(w => w.length > 2);
      const words2 = n2.split(' ').filter(w => w.length > 2);

      let matchCount = 0;
      words1.forEach(w1 => {
        if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
          matchCount++;
        }
      });

      return matchCount >= 2;
    };

    // Para cada firmante que ha firmado
    result.rows.forEach(row => {
      const nombreFirmante = row.real_signer_name || row.user_name;

      // Agregar por nombre de usuario directo
      firmas[row.user_name] = nombreFirmante;

      // Verificar roles para Negociaciones y Causación
      let roles = [];
      if (row.role_names) {
        roles = Array.isArray(row.role_names) ? row.role_names : [row.role_names];
      } else if (row.role_name) {
        roles = [row.role_name];
      }

      // Verificar si tiene rol de Negociaciones
      if (roles.some(r => r && r.toLowerCase().includes('negociaciones'))) {
        firmaNegociaciones = nombreFirmante;
      }

      // Verificar si tiene rol de Causación
      if (roles.some(r => r && r.toLowerCase().includes('causación') || r.toLowerCase().includes('causacion'))) {
        firmaCausacion = nombreFirmante;
      }

      // Verificar contra nombre del negociador
      if (templateData.nombreNegociador && nombresCoinciden(row.user_name, templateData.nombreNegociador)) {
        firmas[templateData.nombreNegociador] = nombreFirmante;
      }

      // Verificar en las filas de control
      if (templateData.filasControl && Array.isArray(templateData.filasControl)) {
        templateData.filasControl.forEach(fila => {
          // Responsable de Cuenta Contable
          if (fila.respCuentaContable && nombresCoinciden(row.user_name, fila.respCuentaContable)) {
            firmas[fila.respCuentaContable] = nombreFirmante;
          }

          // Responsable de Centro de Costos
          if (fila.respCentroCostos && nombresCoinciden(row.user_name, fila.respCentroCostos)) {
            firmas[fila.respCentroCostos] = nombreFirmante;
          }
        });
      }
    });

    // Agregar firmas de Negociaciones y Causación con claves especiales
    if (firmaNegociaciones) {
      firmas['_NEGOCIACIONES'] = firmaNegociaciones;
    }

    if (firmaCausacion) {
      firmas['_CAUSACION'] = firmaCausacion;
    }

    return firmas;
  } catch (error) {
    console.error('❌ Error obteniendo firmas:', error);
    return {};
  }
}

async function regenerateFVPdf(documentId) {
  console.log(`\n🔄 Regenerando PDF para documento ID ${documentId}...\n`);

  try {
    // Obtener información del documento
    const docResult = await query(
      `SELECT
        d.id,
        d.file_path,
        d.original_pdf_backup,
        d.title,
        d.file_name,
        d.created_at,
        d.metadata,
        d.retention_data,
        d.status,
        dt.code as document_type_code,
        dt.name as document_type_name,
        u.name as uploader_name
      FROM documents d
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = $1`,
      [documentId]
    );

    if (docResult.rows.length === 0) {
      throw new Error(`Documento ${documentId} no encontrado`);
    }

    const doc = docResult.rows[0];

    if (doc.document_type_code !== 'FV') {
      throw new Error(`Documento ${documentId} no es de tipo FV`);
    }

    const metadata = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata;
    const retentionData = doc.retention_data
      ? (typeof doc.retention_data === 'string' ? JSON.parse(doc.retention_data) : doc.retention_data).filter(r => r.activa)
      : [];

    console.log(`📄 Documento: ${doc.title}`);
    console.log(`📋 Metadata: ${Object.keys(metadata).length} campos`);
    console.log(`⚠️  Retenciones activas: ${retentionData.length}\n`);

    // Obtener firmas
    const firmas = await obtenerFirmasDocumento(documentId, metadata);
    console.log(`✍️  Firmas obtenidas: ${Object.keys(firmas).length}\n`);

    // Regenerar plantilla FV
    console.log('📋 Generando PDF de plantilla...');
    const templatePdfBuffer = await generateFacturaTemplatePDF(metadata, firmas, false, retentionData);

    const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempPlanillaPath = path.join(tempDir, `planilla_${documentId}_${Date.now()}.pdf`);
    await fs.writeFile(tempPlanillaPath, templatePdfBuffer);
    console.log(`✅ Plantilla generada\n`);

    const relativePath = doc.file_path.replace(/^uploads\//, '');
    const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);

    // Obtener archivos originales de backup
    let backupFilePaths = [];
    if (doc.original_pdf_backup) {
      const backupPathsArray = JSON.parse(doc.original_pdf_backup);
      for (const relPath of backupPathsArray) {
        const backupRelativePath = relPath.replace(/^uploads\//, '');
        const fullBackupPath = path.join(__dirname, '..', 'uploads', backupRelativePath);
        try {
          await fs.access(fullBackupPath);
          backupFilePaths.push(fullBackupPath);
          console.log(`📎 Backup encontrado: ${path.basename(fullBackupPath)}`);
        } catch (err) {
          console.error(`⚠️  Backup no encontrado: ${fullBackupPath}`);
        }
      }
    }

    // Mergear PDFs
    console.log('\n🔗 Mergeando PDFs...');
    const tempMergedPath = path.join(tempDir, `merged_${documentId}_${Date.now()}.pdf`);
    const filesToMerge = [tempPlanillaPath, ...backupFilePaths];
    await mergePDFs(filesToMerge, tempMergedPath);
    console.log(`✅ PDFs mergeados\n`);

    // Obtener firmantes para página de firmas
    const signersResult = await query(
      `SELECT
        ds.user_id, ds.order_position, ds.role_name, ds.role_names,
        ds.is_causacion_group, ds.grupo_codigo,
        u.name as user_name, cg.nombre as grupo_nombre, u.email,
        COALESCE(s.status, 'pending') as status,
        s.signed_at, s.rejected_at, s.rejection_reason, s.consecutivo,
        COALESCE(s.real_signer_name, signer_user.name) as real_signer_name,
        signer_user.email as signer_email
      FROM document_signers ds
      LEFT JOIN users u ON u.id = ds.user_id
      LEFT JOIN causacion_grupos cg ON cg.codigo = ds.grupo_codigo
      LEFT JOIN signatures s ON s.document_id = ds.document_id
        AND (
          (ds.is_causacion_group = FALSE AND s.signer_id = ds.user_id)
          OR
          (ds.is_causacion_group = TRUE AND s.signer_id IS NOT NULL)
        )
      LEFT JOIN users signer_user ON signer_user.id = s.signer_id
      WHERE ds.document_id = $1
      ORDER BY ds.order_position ASC`,
      [documentId]
    );

    const signers = signersResult.rows.map(row => {
      const signer = {
        name: row.is_causacion_group ? row.grupo_nombre : row.user_name,
        email: row.email,
        order_position: row.order_position,
        status: row.status,
        role_name: row.role_name,
        role_names: row.role_names,
        is_causacion_group: row.is_causacion_group,
        signed_at: row.signed_at,
        rejected_at: row.rejected_at,
        rejection_reason: row.rejection_reason,
        real_signer_name: row.real_signer_name,
        signer_email: row.signer_email,
        consecutivo: row.consecutivo
      };

      return signer;
    });

    console.log('📋 Agregando página de firmantes...');
    await addCoverPageWithSigners(
      tempMergedPath,
      signers,
      {
        title: doc.title,
        fileName: doc.file_name,
        createdAt: doc.created_at,
        uploadedBy: doc.uploader_name,
        documentTypeName: doc.document_type_name
      }
    );
    console.log(`✅ Página de firmantes agregada\n`);

    // Copiar el PDF final a la ubicación original
    await fs.copyFile(tempMergedPath, currentPdfPath);
    console.log(`✅ PDF regenerado: ${path.basename(currentPdfPath)}\n`);

    // Limpiar archivos temporales
    await fs.unlink(tempPlanillaPath);
    await fs.unlink(tempMergedPath);
    console.log(`🗑️  Archivos temporales eliminados\n`);

    console.log('========================================');
    console.log(`✅ PDF regenerado exitosamente`);
    console.log(`   Ruta: ${currentPdfPath}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error regenerando PDF:', error);
    throw error;
  }
}

// Leer ID del documento desde argumentos de línea de comandos
const documentId = process.argv[2];

if (!documentId) {
  console.error('❌ Error: Debe proporcionar el ID del documento');
  console.log('Uso: node scripts/regenerate_fv_pdf.js <document_id>');
  process.exit(1);
}

// Ejecutar regeneración
regenerateFVPdf(parseInt(documentId))
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error ejecutando script:', error);
    process.exit(1);
  });
