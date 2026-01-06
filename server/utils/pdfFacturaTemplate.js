const puppeteerPool = require('./puppeteerPool');
const { generateFacturaHTML } = require('./facturaTemplateHTML');

/**
 * Genera un PDF con el template de legalización de factura diligenciado
 * Renderiza HTML que replica EXACTAMENTE el formulario web
 * Página más grande para que se vea TODO completo
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Usa Browser Pool para reutilizar instancias de Puppeteer (~85% más rápido)
 * - Usa 'load' + document.fonts.ready para esperar fuentes embebidas
 *
 * @param {Object} templateData - Datos del template de factura
 * @param {Object} firmas - Objeto con firmas: { 'nombre_persona': 'nombre_firmante' }
 * @param {boolean} isRejected - Si el documento fue rechazado (muestra marca de agua)
 * @param {Array} retentionData - Array con las retenciones activas del documento
 * @returns {Promise<Buffer>} PDF generado con el template
 */
async function generateFacturaTemplatePDF(templateData, firmas = {}, isRejected = false, retentionData = []) {
  let browser = null;
  let page = null;
  const operationId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const htmlContent = generateFacturaHTML({
      consecutivo: templateData.consecutivo || '',
      cia: templateData.cia || '',
      numeroFactura: templateData.numeroFactura || '',
      proveedor: templateData.proveedor || '',
      fechaFactura: templateData.fechaFactura || '',
      fechaRecepcion: templateData.fechaRecepcion || '',
      legalizaAnticipo: templateData.legalizaAnticipo || false,
      checklistRevision: templateData.checklistRevision || {},
      nombreNegociador: templateData.nombreNegociador || '',
      cargoNegociador: templateData.cargoNegociador || '',
      filasControl: templateData.filasControl || [],
      totalPorcentaje: templateData.totalPorcentaje || 0,
      observaciones: templateData.observaciones || '',
      firmas: firmas,
      retentionData: retentionData,
      isRejected: isRejected
    });

    // Obtener browser del pool (reutiliza instancias para velocidad)
    browser = await puppeteerPool.getBrowser();

    page = await browser.newPage();

    await page.setViewport({
      width: 1800,
      height: 1200
    });

    // OPTIMIZATION: Usar 'load' para esperar a que las fuentes embebidas se carguen
    // 'load' espera a que todos los recursos (incluidas fuentes base64) estén listos
    await page.setContent(htmlContent, { waitUntil: 'load' });

    // Esperar específicamente a que todas las fuentes estén cargadas
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      width: '1600px',
      height: '1100px',
      printBackground: true,
      margin: {
        top: '10px',
        right: '10px',
        bottom: '10px',
        left: '10px'
      }
    });

    return pdfBuffer;

  } catch (error) {
    console.error(`❌ [${operationId}] Error generando PDF de plantilla:`, error);
    throw new Error(`Error al generar PDF de plantilla: ${error.message}`);
  } finally {
    // CRITICAL: Cerrar la página y devolver browser al pool
    // Cada operación en su propio try-catch para garantizar que ambas se ejecuten
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error(`⚠️ [${operationId}] Error cerrando página (no crítico):`, closeError.message);
      }
    }

    if (browser) {
      try {
        await puppeteerPool.releaseBrowser(browser);
      } catch (releaseError) {
        console.error(`❌ [${operationId}] Error CRÍTICO liberando browser:`, releaseError);
        // Este es crítico porque el browser se queda bloqueado en el pool
      }
    }
  }
}

module.exports = { generateFacturaTemplatePDF };
