const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Genera un PDF con el template de legalización de factura diligenciado
 * @param {Object} templateData - Datos del template de factura
 * @returns {Promise<Buffer>} PDF generado con el template
 */
async function generateFacturaTemplatePDF(templateData) {
  try {
    console.log('📋 Generando PDF de plantilla de factura...');

    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const width = 595.28;
    const height = 841.89;
    const margin = 50;
    const lineHeight = 16;

    let page = pdfDoc.addPage([width, height]);
    let yPosition = height - margin;

    const colors = {
      primary: rgb(0.2, 0.4, 0.8),
      dark: rgb(0.1, 0.1, 0.1),
      gray: rgb(0.4, 0.4, 0.4),
      lightGray: rgb(0.85, 0.85, 0.85),
      success: rgb(0.2, 0.7, 0.3),
      background: rgb(0.98, 0.98, 0.98)
    };

    // ========== FUNCIÓN AUXILIAR: Verificar espacio y crear nueva página ==========
    const checkSpace = (requiredSpace) => {
      if (yPosition - requiredSpace < margin) {
        page = pdfDoc.addPage([width, height]);
        yPosition = height - margin;
        return true;
      }
      return false;
    };

    // ========== FUNCIÓN AUXILIAR: Dibujar línea separadora ==========
    const drawSeparator = () => {
      checkSpace(10);
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: width - margin, y: yPosition },
        thickness: 1,
        color: colors.lightGray
      });
      yPosition -= 20;
    };

    // ========== FUNCIÓN AUXILIAR: Dibujar checkbox ==========
    const drawCheckbox = (x, y, checked) => {
      const size = 12;
      page.drawRectangle({
        x,
        y: y - size,
        width: size,
        height: size,
        borderColor: colors.gray,
        borderWidth: 1.5,
        color: checked ? colors.success : rgb(1, 1, 1)
      });

      if (checked) {
        page.drawText('✓', {
          x: x + 2,
          y: y - size + 2,
          size: 10,
          font: fontBold,
          color: rgb(1, 1, 1)
        });
      }
    };

    // ========== TÍTULO PRINCIPAL ==========
    page.drawRectangle({
      x: 0,
      y: yPosition - 50,
      width: width,
      height: 50,
      color: colors.primary
    });

    page.drawText('LEGALIZACIÓN DE FACTURA', {
      x: margin,
      y: yPosition - 32,
      size: 20,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    yPosition -= 70;

    // ========== INFORMACIÓN DE LA FACTURA ==========
    checkSpace(150);

    page.drawText('Información de la Factura', {
      x: margin,
      y: yPosition,
      size: 14,
      font: fontBold,
      color: colors.dark
    });

    yPosition -= 25;

    const facturaFields = [
      { label: 'Consecutivo:', value: String(templateData.consecutivo || '') },
      { label: 'Proveedor:', value: String(templateData.proveedor || '') },
      { label: 'Número de Factura:', value: String(templateData.numeroFactura || '') },
      { label: 'Fecha de Factura:', value: String(templateData.fechaFactura || '') },
      { label: 'Fecha de Recepción:', value: String(templateData.fechaRecepcion || '') }
    ];

    for (const field of facturaFields) {
      checkSpace(lineHeight + 5);

      page.drawText(field.label, {
        x: margin,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: colors.dark
      });

      page.drawText(field.value, {
        x: margin + 150,
        y: yPosition,
        size: 10,
        font: fontRegular,
        color: colors.gray
      });

      yPosition -= lineHeight;
    }

    checkSpace(25);
    const checkboxX = margin;
    drawCheckbox(checkboxX, yPosition + 10, templateData.legalizaAnticipo || false);

    page.drawText('Legaliza Anticipo', {
      x: checkboxX + 20,
      y: yPosition,
      size: 10,
      font: fontRegular,
      color: colors.dark
    });

    yPosition -= 30;
    drawSeparator();

    // ========== CHECKLIST DE REVISIÓN ==========
    checkSpace(180);

    page.drawText('Checklist de Revisión', {
      x: margin,
      y: yPosition,
      size: 14,
      font: fontBold,
      color: colors.dark
    });

    yPosition -= 25;

    const checklistItems = [
      { key: 'fechaEmision', label: 'Fecha de Emisión' },
      { key: 'fechaVencimiento', label: 'Fecha de Vencimiento' },
      { key: 'cantidades', label: 'Cantidades' },
      { key: 'precioUnitario', label: 'Precio Unitario' },
      { key: 'fletes', label: 'Fletes' },
      { key: 'valoresTotales', label: 'Valores Totales (Valor OC)' },
      { key: 'descuentosTotales', label: 'Descuentos Totales' }
    ];

    for (const item of checklistItems) {
      checkSpace(lineHeight + 5);
      const checked = templateData.checklistRevision?.[item.key] || false;

      drawCheckbox(margin, yPosition + 10, checked);

      page.drawText(item.label, {
        x: margin + 20,
        y: yPosition,
        size: 10,
        font: fontRegular,
        color: colors.dark
      });

      yPosition -= lineHeight;
    }

    yPosition -= 15;
    drawSeparator();

    // ========== NEGOCIADOR ==========
    checkSpace(80);

    page.drawText('Información del Negociador', {
      x: margin,
      y: yPosition,
      size: 14,
      font: fontBold,
      color: colors.dark
    });

    yPosition -= 25;

    const negociadorFields = [
      { label: 'Nombre:', value: String(templateData.nombreNegociador || '') },
      { label: 'Cargo:', value: String(templateData.cargoNegociador || '') }
    ];

    for (const field of negociadorFields) {
      checkSpace(lineHeight + 5);

      page.drawText(field.label, {
        x: margin,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: colors.dark
      });

      page.drawText(field.value, {
        x: margin + 150,
        y: yPosition,
        size: 10,
        font: fontRegular,
        color: colors.gray
      });

      yPosition -= lineHeight;
    }

    yPosition -= 15;
    drawSeparator();

    // ========== GRUPO DE CAUSACIÓN ==========
    checkSpace(60);

    page.drawText('Grupo de Causación', {
      x: margin,
      y: yPosition,
      size: 14,
      font: fontBold,
      color: colors.dark
    });

    yPosition -= 25;

    page.drawText(templateData.grupoCausacion || 'No especificado', {
      x: margin,
      y: yPosition,
      size: 11,
      font: fontRegular,
      color: colors.primary
    });

    yPosition -= 30;
    drawSeparator();

    // ========== TABLA DE CONTROL DE FIRMAS ==========
    checkSpace(100);

    page.drawText('Control de Firmas', {
      x: margin,
      y: yPosition,
      size: 14,
      font: fontBold,
      color: colors.dark
    });

    yPosition -= 30;

    const filasControl = templateData.filasControl || [];

    if (filasControl.length === 0) {
      page.drawText('No se han agregado filas de control', {
        x: margin,
        y: yPosition,
        size: 10,
        font: fontRegular,
        color: colors.gray
      });
      yPosition -= 20;
    } else {
      for (let i = 0; i < filasControl.length; i++) {
        const fila = filasControl[i];

        checkSpace(200);

        page.drawRectangle({
          x: margin - 5,
          y: yPosition - 165,
          width: width - 2 * margin + 10,
          height: 175,
          color: colors.background,
          borderColor: colors.lightGray,
          borderWidth: 1
        });

        page.drawText(`Fila ${i + 1}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: fontBold,
          color: colors.primary
        });

        yPosition -= 20;

        const controlFields = [
          { label: 'No. Cuenta Contable:', value: String(fila.noCuentaContable || '') },
          { label: 'Nombre Cuenta:', value: String(fila.nombreCuentaContable || '') },
          { label: 'Resp. Cuenta Contable:', value: String(fila.respCuentaContable || '') },
          { label: 'Cargo:', value: String(fila.cargoCuentaContable || '') },
          { label: 'Centro de Costos:', value: String(fila.centroCostos || '') },
          { label: 'Resp. Centro de Costos:', value: String(fila.respCentroCostos || '') },
          { label: 'Cargo Centro:', value: String(fila.cargoCentroCostos || '') },
          { label: 'Porcentaje:', value: fila.porcentaje ? `${fila.porcentaje}%` : '' }
        ];

        for (const field of controlFields) {
          page.drawText(field.label, {
            x: margin + 5,
            y: yPosition,
            size: 9,
            font: fontBold,
            color: colors.dark
          });

          const valueText = field.value.length > 50
            ? field.value.substring(0, 47) + '...'
            : field.value;

          page.drawText(valueText, {
            x: margin + 160,
            y: yPosition,
            size: 9,
            font: fontRegular,
            color: colors.gray
          });

          yPosition -= 15;
        }

        yPosition -= 20;
      }

      checkSpace(30);
      const totalPorcentaje = filasControl.reduce((sum, fila) => {
        return sum + (parseFloat(fila.porcentaje) || 0);
      }, 0);

      page.drawText(`Total Porcentaje: ${totalPorcentaje.toFixed(2)}%`, {
        x: width - margin - 150,
        y: yPosition,
        size: 11,
        font: fontBold,
        color: totalPorcentaje === 100 ? colors.success : rgb(0.8, 0.2, 0.2)
      });

      yPosition -= 30;
    }

    // ========== PIE DE PÁGINA EN ÚLTIMA PÁGINA ==========
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    lastPage.drawLine({
      start: { x: margin, y: 50 },
      end: { x: width - margin, y: 50 },
      thickness: 0.5,
      color: colors.lightGray
    });

    const currentDate = new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    lastPage.drawText(`Documento generado el ${currentDate}`, {
      x: margin,
      y: 35,
      size: 8,
      font: fontRegular,
      color: colors.gray
    });

    lastPage.drawText('Sistema DocuPrex - Legalización de Facturas', {
      x: width - margin - 200,
      y: 35,
      size: 8,
      font: fontRegular,
      color: colors.gray
    });

    const pdfBytes = await pdfDoc.save();
    console.log('✅ PDF de plantilla de factura generado exitosamente');

    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('❌ Error al generar PDF de plantilla de factura:', error);
    throw error;
  }
}

module.exports = {
  generateFacturaTemplatePDF
};
