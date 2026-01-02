const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

/**
 * Agrega un sello de "RECHAZADO" o "APROBADO" en la esquina superior izquierda de la PRIMERA página del PDF (planilla)
 * @param {string} pdfPath - Ruta del archivo PDF
 * @param {string} stampType - Tipo de sello: 'RECHAZADO' o 'APROBADO'
 */
async function addStampToPdf(pdfPath, stampType) {
  try {
    // Leer el PDF existente
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Obtener solo la PRIMERA página (planilla)
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      console.log('⚠️ PDF sin páginas, no se puede agregar sello');
      return false;
    }

    const firstPage = pages[0];
    const { height } = firstPage.getSize();

    // Determinar qué imagen de sello usar
    const stampFileName = stampType === 'RECHAZADO' ? 'rechazado.png' : 'aprobado.png';
    const stampImagePath = path.join(__dirname, '..', 'assets', 'stamps', stampFileName);

    // Verificar que la imagen existe
    try {
      await fs.access(stampImagePath);
    } catch (error) {
      console.error(`❌ Imagen de sello no encontrada: ${stampImagePath}`);
      return false;
    }

    // Leer la imagen del sello
    const stampImageBytes = await fs.readFile(stampImagePath);
    const stampImage = await pdfDoc.embedPng(stampImageBytes);

    // Obtener dimensiones originales de la imagen
    const { width: imgWidth, height: imgHeight } = stampImage.scale(1);

    // Definir el tamaño deseado del sello en el PDF (ancho máximo)
    const maxStampWidth = 100;

    // Calcular el scaling manteniendo aspect ratio
    const scale = maxStampWidth / imgWidth;
    const stampWidth = imgWidth * scale;
    const stampHeight = imgHeight * scale;

    // Posición del sello (esquina superior izquierda, en espacio blanco)
    const stampX = 15; // Margen izquierdo
    const stampY = height - stampHeight - 10; // Margen superior (muy arriba)

    // Dibujar el sello en la primera página manteniendo proporciones
    firstPage.drawImage(stampImage, {
      x: stampX,
      y: stampY,
      width: stampWidth,
      height: stampHeight,
      opacity: 1.0 // Opacidad completa para imágenes PNG con transparencia
    });

    // Guardar el PDF modificado
    const modifiedPdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, modifiedPdfBytes);

    console.log(`✅ Sello "${stampType}" agregado exitosamente a la primera página de ${path.basename(pdfPath)}`);
    return true;
  } catch (error) {
    console.error(`❌ Error agregando sello ${stampType} al PDF:`, error);
    throw error;
  }
}

module.exports = {
  addStampToPdf
};
