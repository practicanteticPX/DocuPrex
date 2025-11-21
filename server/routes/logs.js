/**
 * Rutas API para Logs en PDF
 *
 * Endpoints para ver y descargar los PDFs de logs
 * Solo accesible para administradores
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const pdfLogger = require('../utils/pdfLogger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/logs/list
 * Lista todos los PDFs de logs disponibles
 */
router.get('/list', authenticateToken, requireAdmin, (req, res) => {
  try {
    const logs = pdfLogger.listLogPDFs();
    res.json({
      success: true,
      logs: logs.map(log => ({
        fileName: log.fileName,
        date: log.date,
        downloadUrl: `/api/logs/download/${log.date}`
      }))
    });
  } catch (error) {
    console.error('Error al listar logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar los logs'
    });
  }
});

/**
 * GET /api/logs/today
 * Genera y descarga el PDF de hoy
 */
router.get('/today', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pdfPath = await pdfLogger.generateTodayPDF();

    res.download(pdfPath, `log_hoy_${new Date().toISOString().split('T')[0]}.pdf`, (err) => {
      if (err) {
        console.error('Error al descargar PDF:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error al descargar el PDF de logs'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error al generar PDF de hoy:', error);
    res.status(404).json({
      success: false,
      message: 'No hay logs para el día de hoy'
    });
  }
});

/**
 * GET /api/logs/download/:date
 * Descarga el PDF de una fecha específica
 * Formato de fecha: YYYY-MM-DD
 */
router.get('/download/:date', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { date } = req.params;

    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de fecha inválido. Use YYYY-MM-DD'
      });
    }

    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const pdfPath = await pdfLogger.getLogPDF(dateObj);

    res.download(pdfPath, `log_${date}.pdf`, (err) => {
      if (err) {
        console.error('Error al descargar PDF:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error al descargar el PDF de logs'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener PDF:', error);
    res.status(404).json({
      success: false,
      message: 'No hay logs para esta fecha'
    });
  }
});

/**
 * GET /api/logs/view/:date
 * Visualiza el PDF de una fecha específica en el navegador
 * Formato de fecha: YYYY-MM-DD
 */
router.get('/view/:date', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { date } = req.params;

    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de fecha inválido. Use YYYY-MM-DD'
      });
    }

    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const pdfPath = await pdfLogger.getLogPDF(dateObj);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="log_${date}.pdf"`);

    res.sendFile(pdfPath, (err) => {
      if (err) {
        console.error('Error al enviar PDF:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error al visualizar el PDF de logs'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener PDF:', error);
    res.status(404).json({
      success: false,
      message: 'No hay logs para esta fecha'
    });
  }
});

/**
 * POST /api/logs/generate/:date
 * Genera manualmente el PDF de una fecha específica
 * Formato de fecha: YYYY-MM-DD
 */
router.post('/generate/:date', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { date } = req.params;

    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de fecha inválido. Use YYYY-MM-DD'
      });
    }

    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const pdfPath = await pdfLogger.generateDailyPDF(dateObj);

    res.json({
      success: true,
      message: 'PDF generado exitosamente',
      downloadUrl: `/api/logs/download/${date}`,
      viewUrl: `/api/logs/view/${date}`
    });
  } catch (error) {
    console.error('Error al generar PDF:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al generar el PDF'
    });
  }
});

module.exports = router;
