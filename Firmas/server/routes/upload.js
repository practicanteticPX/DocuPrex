const express = require('express');
const path = require('path');
const fs = require('fs');
const { uploadSinglePDF, uploadMultiplePDFs, normalizeUserName, uploadDir } = require('../utils/fileUpload');
const { mergePDFs, cleanupTempFiles, validatePDFs } = require('../utils/pdfMerger');
const { query } = require('../database/db');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

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

    const { title, description } = req.body;

    try {
      // Construir ruta: usuario/archivo.pdf
      const normalizedUserName = normalizeUserName(req.user.name);
      const relativePath = `uploads/${normalizedUserName}/${req.file.filename}`;

      // Usar el título proporcionado por el usuario, o el nombre del archivo como fallback
      const docTitle = title?.trim() || path.basename(req.file.originalname, path.extname(req.file.originalname));

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
          uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          docTitle,
          description?.trim() || null,
          req.file.filename,
          relativePath,
          req.file.size,
          req.file.mimetype,
          'pending',
          req.user.id
        ]
      );

      const document = result.rows[0];

      // Registrar en auditoría
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          'upload',
          'document',
          document.id,
          JSON.stringify({ title, file_name: req.file.filename }),
          req.ip
        ]
      );

      console.log(`âœ… Documento subido: ${document.title} (ID: ${document.id})`);

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

    const { title, description } = req.body;

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
            uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            docTitle,
            description?.trim() || null,
            f.filename,
            relativePath,
            f.size,
            f.mimetype,
            'pending',
            req.user.id
          ]
        );
        const document = result.rows[0];

        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.id,
            'upload',
            'document',
            document.id,
            JSON.stringify({ title, file_name: f.filename }),
            req.ip
          ]
        );
        created.push(document);
      }

      console.log(`âœ” Documentos subidos: ${created.length}`);
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

    const { title, description } = req.body;

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
      console.log('🔍 Validando archivos PDF...');
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

      // Unificar los PDFs
      console.log('🔀 Unificando PDFs...');
      const mergeResult = await mergePDFs(filePaths, mergedPdfPath);

      if (!mergeResult.success) {
        throw new Error('Error al unificar los PDFs');
      }

      // Guardar el documento unificado en la base de datos
      const docTitle = title?.trim() || 'Documento Unificado';
      const relativePath = `uploads/${normalizedUserName}/${mergedFileName}`;

      const result = await query(
        `INSERT INTO documents (
          title,
          description,
          file_name,
          file_path,
          file_size,
          mime_type,
          status,
          uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          docTitle,
          description?.trim() || `Documento unificado de ${req.files.length} archivos`,
          mergedFileName,
          relativePath,
          mergeResult.fileSize,
          'application/pdf',
          'pending',
          req.user.id
        ]
      );

      const document = result.rows[0];

      // Registrar en auditoría
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          'upload',
          'document',
          document.id,
          JSON.stringify({
            title: docTitle,
            file_name: mergedFileName,
            files_merged: req.files.length,
            total_pages: mergeResult.totalPages,
            source_files: req.files.map(f => f.originalname)
          }),
          req.ip
        ]
      );

      // Eliminar archivos temporales originales
      console.log('🗑️  Limpiando archivos temporales...');
      await cleanupTempFiles(filePaths);

      console.log(`✅ Documento unificado creado: ${document.title} (ID: ${document.id})`);

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
