const express = require('express');
const path = require('path');
const fs = require('fs');
const { uploadSinglePDF, uploadMultiplePDFs, normalizeUserName, uploadDir } = require('../utils/fileUpload');
const { mergePDFs, cleanupTempFiles, validatePDFs } = require('../utils/pdfMerger');
const { query } = require('../database/db');
const { queryFacturas } = require('../database/facturas-db');
const jwt = require('jsonwebtoken');
const pdfLogger = require('../utils/pdfLogger');
const { moveToSinCausar } = require('../services/facturaFileService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

async function syncFacturaOrdenCompra(consecutivo, metadata) {
  const numeroControl = String(consecutivo || metadata?.consecutivo || '').trim();
  if (!numeroControl) return;

  await queryFacturas(
    `UPDATE crud_facturas."T_Facturas"
     SET orden_compra = $2,
         nota_credito = COALESCE($3, nota_credito)
     WHERE numero_control = $1`,
    [
      numeroControl,
      metadata?.ordenCompra ? String(metadata.ordenCompra).trim() : null,
      typeof metadata?.notaCredito === 'boolean' ? metadata.notaCredito : null
    ]
  );
}

/**
 * Middleware para verificar autenticación y cargar datos del usuario
 */
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No autorizado' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Cargar nombre del usuario desde la base de datos
    const userResult = await query('SELECT id, name, email, role FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }
};

/**
 * POST /api/upload
 * Endpoint para subir documentos PDF
 */
router.post('/upload', authenticate, (req, res) => {
  uploadSinglePDF(req, res, async (err) => {
    if (err) {
      console.error('Error en subida:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Error al subir el archivo'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha proporcionado ningún archivo'
      });
    }

    const { title, description, documentTypeId, consecutivo, templateData } = req.body;

    try {
      const normalizedUserName = normalizeUserName(req.user.name);
      let currentRelativePath = `uploads/${normalizedUserName}/${req.file.filename}`;
      let currentFileName = req.file.filename;

      let docTitle = title?.trim() || path.basename(req.file.originalname, path.extname(req.file.originalname));
      docTitle = docTitle.replace(/\s+/g, ' ');

      let parsedMetadata = {};
      if (templateData) {
        try {
          parsedMetadata = typeof templateData === 'string' ? JSON.parse(templateData) : templateData;
        } catch (parseError) {
          console.error('⚠️ Error al parsear templateData:', parseError);
          parsedMetadata = {};
        }
      }

      // 🔑 BACKUP DEL PDF INDIVIDUAL ANTES DE PROCESARLO
      const backupDir = path.join(__dirname, '..', 'uploads', 'originals');
      const fs = require('fs').promises;
      await fs.mkdir(backupDir, { recursive: true });

      const backupFileName = `${Date.now()}_0_${req.file.originalname}`;
      const backupPath = path.join(backupDir, backupFileName);
      const relativeBackupPath = `uploads/originals/${backupFileName}`;

      await fs.copyFile(req.file.path, backupPath);
      console.log(`✅ Backup guardado: ${req.file.originalname}`);

      // Para FV desde facturacion: mover a "Facturas sin causar/{creador}/{nit}_{#factura}.pdf"
      if (documentTypeId && consecutivo?.trim()) {
        try {
          const dtResult = await query(`SELECT code FROM document_types WHERE id = $1`, [documentTypeId]);
          if (dtResult.rows[0]?.code === 'FV') {
            const nitResult = await queryFacturas(
              `SELECT nit, numero_factura FROM crud_facturas."T_Facturas" WHERE numero_control = $1`,
              [consecutivo.trim()]
            );

            if (nitResult.rows[0]?.nit) {
              const { nit, numero_factura } = nitResult.rows[0];
              const moved = await moveToSinCausar(req.file.path, nit, numero_factura, req.user.name);
              currentRelativePath = moved.newRelativePath;
              currentFileName = moved.newFileName;
              console.log(`📂 FV guardada en Facturas sin causar: ${currentRelativePath}`);
            }
          }
        } catch (moveErr) {
          // Non-fatal: file stays in default location if move fails
          console.error('⚠️ No se pudo mover a Facturas sin causar:', moveErr.message);
        }
      }

      // Guardar el documento en la base de datos
      const result = await query(
        `INSERT INTO documents (
          title,
          description,
          file_name,
          file_path,
          file_size,
          mime_type,
          status,
          uploaded_by,
          document_type_id,
          consecutivo,
          metadata,
          original_pdf_backup
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          docTitle,
          description?.trim() || null,
          currentFileName,
          currentRelativePath,
          req.file.size,
          req.file.mimetype,
          'pending',
          req.user.id,
          documentTypeId || null,
          consecutivo?.trim() || null,
          JSON.stringify(parsedMetadata),
          JSON.stringify([relativeBackupPath])
        ]
      );

      const document = result.rows[0];

      if (documentTypeId && consecutivo?.trim()) {
        try {
          await syncFacturaOrdenCompra(consecutivo, parsedMetadata);
        } catch (syncError) {
          console.error('⚠️ No se pudo sincronizar orden de compra en T_Facturas:', syncError.message);
        }
      }

      // Registrar en logs
      pdfLogger.logDocumentCreated(req.user.name, document.title);

      console.log(`✅ Documento subido exitosamente:`);
      console.log(`   📄 ID: ${document.id}`);
      console.log(`   📝 Título: ${document.title}`);
      console.log(`   🏷️  Tipo: ${document.document_type_id || 'sin tipo'}`);
      console.log(`   👤 Subido por: ${req.user.name} (ID: ${req.user.id})`);

      res.json({
        success: true,
        message: 'Documento subido exitosamente',
        document: {
          id: document.id,
          title: document.title,
          description: document.description,
          fileName: document.file_name,
          fileSize: document.file_size,
          status: document.status,
          createdAt: document.created_at
        }
      });
    } catch (dbError) {
      console.error('Error en base de datos:', dbError);

      // Si hay error, intentar eliminar el archivo subido
      const fs = require('fs');
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Error al eliminar archivo:', unlinkErr);
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al guardar el documento en la base de datos'
      });
    }
  });
});

/**
 * POST /api/upload-multiple
 * Endpoint para subir múltiples documentos PDF
 */
router.post('/upload-multiple', authenticate, (req, res) => {
  uploadMultiplePDFs(req, res, async (err) => {
    if (err) {
      console.error('Error en subida múltiple:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Error al subir los archivos'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se han proporcionado archivos'
      });
    }

    const { title, description, documentTypeId, consecutivo } = req.body;

    const created = [];
    try {
      const normalizedUserName = normalizeUserName(req.user.name);

      for (const f of req.files) {
        const relativePath = `uploads/${normalizedUserName}/${f.filename}`;
        // Usar el título proporcionado por el usuario, o el nombre del archivo como fallback
        const docTitle = title?.trim() || path.basename(f.originalname, path.extname(f.originalname));
        const result = await query(
          `INSERT INTO documents (
            title,
            description,
            file_name,
            file_path,
            file_size,
            mime_type,
            status,
            uploaded_by,
            document_type_id,
            consecutivo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            docTitle,
            description?.trim() || null,
            f.filename,
            relativePath,
            f.size,
            f.mimetype,
            'pending',
            req.user.id,
            documentTypeId || null,
            consecutivo?.trim() || null
          ]
        );
        const document = result.rows[0];

        // Registrar en logs
        pdfLogger.logDocumentCreated(req.user.name, document.title);

        console.log(`✅ Documento ${created.length + 1} subido exitosamente:`);
        console.log(`   📄 ID: ${document.id}`);
        console.log(`   📝 Título: ${document.title}`);
        console.log(`   🏷️  Tipo: ${document.document_type_id || 'sin tipo'}`);

        created.push(document);
      }

      console.log(`✅ Total de documentos subidos: ${created.length}`);
      return res.json({
        success: true,
        message: `Se subieron ${created.length} documento(s) exitosamente`,
        documents: created.map(d => ({
          id: d.id,
          title: d.title,
          description: d.description,
          fileName: d.file_name,
          fileSize: d.file_size,
          status: d.status,
          createdAt: d.created_at
        }))
      });
    } catch (dbError) {
      console.error('Error en base de datos (múltiple):', dbError);
      // No intentamos borrar archivos aquí para evitar inconsistencias si ya hay registros
      return res.status(500).json({
        success: false,
        message: 'Error al guardar los documentos en la base de datos'
      });
    }
  });
});

/**
 * POST /api/upload-unified
 * Endpoint para subir múltiples PDFs y unificarlos en un solo documento
 */
router.post('/upload-unified', authenticate, (req, res) => {
  uploadMultiplePDFs(req, res, async (err) => {
    if (err) {
      console.error('Error en subida unificada:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Error al subir los archivos'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se han proporcionado archivos'
      });
    }

    const { title, description, documentTypeId, consecutivo, templateData } = req.body;

    // Validar que hay más de un archivo para unificar
    if (req.files.length === 1) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren al menos 2 archivos para unificar'
      });
    }

    const uploadedFiles = [];
    let mergedPdfPath = null;

    try {
      const normalizedUserName = normalizeUserName(req.user.name);
      const userDir = path.join(uploadDir, normalizedUserName);

      // Obtener las rutas de todos los archivos subidos
      const filePaths = req.files.map(f => f.path);

      // Validar que todos los archivos sean PDFs válidos
      const validation = await validatePDFs(filePaths);

      if (!validation.allValid) {
        // Si hay archivos inválidos, eliminar todos los archivos subidos
        await cleanupTempFiles(filePaths);
        return res.status(400).json({
          success: false,
          message: 'Uno o más archivos no son PDFs válidos',
          invalidFiles: validation.invalidFiles.map(f => path.basename(f.path))
        });
      }

      // Crear nombre para el archivo unificado
      const timestamp = Date.now();
      const randomSuffix = Math.round(Math.random() * 1E9);
      const mergedFileName = `unificado-${timestamp}-${randomSuffix}.pdf`;
      mergedPdfPath = path.join(userDir, mergedFileName);

      // 🔑 HACER BACKUP DE CADA PDF INDIVIDUAL ANTES DE FUSIONAR
      const backupDir = path.join(__dirname, '..', 'uploads', 'originals');
      const fs = require('fs').promises;
      await fs.mkdir(backupDir, { recursive: true });

      const backupPaths = [];
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const backupFileName = `${Date.now()}_${i}_${file.originalname}`;
        const backupPath = path.join(backupDir, backupFileName);
        const relativeBackupPath = `uploads/originals/${backupFileName}`;

        await fs.copyFile(file.path, backupPath);
        backupPaths.push(relativeBackupPath);
      }

      // Unificar los PDFs
      const mergeResult = await mergePDFs(filePaths, mergedPdfPath);

      if (!mergeResult.success) {
        throw new Error('Error al unificar los PDFs');
      }

      // Parsear templateData si viene como string JSON
      let parsedMetadata = {};
      if (templateData) {
        try {
          parsedMetadata = typeof templateData === 'string' ? JSON.parse(templateData) : templateData;
        } catch (parseError) {
          console.error('⚠️ Error al parsear templateData:', parseError);
          parsedMetadata = {};
        }
      }

      // Para FV desde facturacion: mover el PDF unificado a "Facturas sin causar"
      let currentRelativePath = `uploads/${normalizedUserName}/${mergedFileName}`;
      let currentFileName = mergedFileName;

      if (documentTypeId && consecutivo?.trim()) {
        try {
          const dtResult = await query(`SELECT code FROM document_types WHERE id = $1`, [documentTypeId]);
          if (dtResult.rows[0]?.code === 'FV') {
            const nitResult = await queryFacturas(
              `SELECT nit, numero_factura FROM crud_facturas."T_Facturas" WHERE numero_control = $1`,
              [consecutivo.trim()]
            );

            if (nitResult.rows[0]?.nit) {
              const { nit, numero_factura } = nitResult.rows[0];
              const moved = await moveToSinCausar(mergedPdfPath, nit, numero_factura, req.user.name);
              currentRelativePath = moved.newRelativePath;
              currentFileName = moved.newFileName;
              mergedPdfPath = null; // file was moved, nothing to clean up
              console.log(`📂 FV unificada guardada en Facturas sin causar: ${currentRelativePath}`);
            }
          }
        } catch (moveErr) {
          console.error('⚠️ No se pudo mover FV unificada a Facturas sin causar:', moveErr.message);
        }
      }

      // Guardar el documento unificado en la base de datos
      const docTitle = title?.trim() || 'Documento Unificado';

      const result = await query(
        `INSERT INTO documents (
          title,
          description,
          file_name,
          file_path,
          file_size,
          mime_type,
          status,
          uploaded_by,
          document_type_id,
          consecutivo,
          metadata,
          original_pdf_backup
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          docTitle,
          description?.trim() || null,
          currentFileName,
          currentRelativePath,
          mergeResult.fileSize,
          'application/pdf',
          'pending',
          req.user.id,
          documentTypeId || null,
          consecutivo?.trim() || null,
          JSON.stringify(parsedMetadata),
          JSON.stringify(backupPaths)  // Guardar array de backups como JSON
        ]
      );

      const document = result.rows[0];

      if (documentTypeId && consecutivo?.trim()) {
        try {
          await syncFacturaOrdenCompra(consecutivo, parsedMetadata);
        } catch (syncError) {
          console.error('⚠️ No se pudo sincronizar orden de compra en T_Facturas:', syncError.message);
        }
      }

      // Eliminar archivos temporales originales
      console.log('🗑️  Limpiando archivos temporales...');
      await cleanupTempFiles(filePaths);

      // console.log(`✅ Documento unificado creado: ${document.title} (ID: ${document.id})`);

      res.json({
        success: true,
        message: `${req.files.length} documentos unificados exitosamente`,
        document: {
          id: document.id,
          title: document.title,
          description: document.description,
          fileName: document.file_name,
          fileSize: document.file_size,
          status: document.status,
          createdAt: document.created_at,
          totalPages: mergeResult.totalPages,
          filesProcessed: mergeResult.filesProcessed
        }
      });
    } catch (dbError) {
      console.error('Error en base de datos (unificado):', dbError);

      // Si hay error, intentar eliminar todos los archivos
      const allFiles = req.files.map(f => f.path);
      if (mergedPdfPath) {
        allFiles.push(mergedPdfPath);
      }

      await cleanupTempFiles(allFiles);

      res.status(500).json({
        success: false,
        message: 'Error al procesar y guardar el documento unificado'
      });
    }
  });
});

module.exports = router;
