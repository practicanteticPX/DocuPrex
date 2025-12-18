const puppeteer = require('puppeteer');
const { generateFacturaHTML } = require('./facturaTemplateHTML');

/**
 * Genera un PDF con el template de legalización de factura diligenciado
 * Renderiza HTML que replica EXACTAMENTE el formulario web
 * Página más grande para que se vea TODO completo
 * @param {Object} templateData - Datos del template de factura
 * @param {Object} firmas - Objeto con firmas: { 'nombre_persona': 'nombre_firmante' }
 * @param {boolean} isRejected - Si el documento fue rechazado (muestra marca de agua)
 * @returns {Promise<Buffer>} PDF generado con el template
 */
async function generateFacturaTemplatePDF(templateData, firmas = {}, isRejected = false) {
  let browser = null;

  try {
    console.log('📋 Generando PDF de plantilla de factura (HTML → PDF)...');

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
      isRejected: isRejected
    });

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1800,
      height: 1200
    });

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

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

    console.log('✅ PDF de plantilla generado correctamente (página grande)');
    return pdfBuffer;

  } catch (error) {
    console.error('❌ Error generando PDF de plantilla:', error);
    throw new Error(`Error al generar PDF de plantilla: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { generateFacturaTemplatePDF };
