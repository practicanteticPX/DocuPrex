/**
 * Funciones de ayuda para generación de PDFs
 * Utilidades comunes usadas en la generación de PDFs
 */

const { COLORS, DOCUMENT_STATUS, SIGNATURE_STATUS } = require('./constants');

/**
 * Determina el estado general del documento basado en los firmantes
 * @param {Array} signers - Array de firmantes
 * @returns {string} Estado del documento (FIRMADO, RECHAZADO, PENDIENTE)
 */
function getDocumentStatus(signers) {
  if (!signers || signers.length === 0) {
    return DOCUMENT_STATUS.PENDING;
  }

  const anyRejected = signers.some(s => s.status === SIGNATURE_STATUS.REJECTED);
  const allSigned = signers.every(s => s.status === SIGNATURE_STATUS.SIGNED);

  if (anyRejected) {
    return DOCUMENT_STATUS.REJECTED;
  } else if (allSigned) {
    return DOCUMENT_STATUS.SIGNED;
  } else {
    return DOCUMENT_STATUS.PENDING;
  }
}

/**
 * Obtiene el color de texto para un estado de firma
 * @param {string} status - Estado de la firma
 * @returns {Object} Color RGB
 */
function getStatusColor(status) {
  switch (status) {
    case SIGNATURE_STATUS.SIGNED:
      return COLORS.SIGNED;
    case SIGNATURE_STATUS.REJECTED:
      return COLORS.REJECTED;
    case SIGNATURE_STATUS.PENDING:
    default:
      return COLORS.PENDING;
  }
}

/**
 * Obtiene el color de fondo para un estado de firma
 * @param {string} status - Estado de la firma
 * @returns {Object} Color RGB
 */
function getStatusBackgroundColor(status) {
  switch (status) {
    case SIGNATURE_STATUS.SIGNED:
      return COLORS.BG_SIGNED;
    case SIGNATURE_STATUS.REJECTED:
      return COLORS.BG_REJECTED;
    case SIGNATURE_STATUS.PENDING:
    default:
      return COLORS.BG_PENDING;
  }
}

/**
 * Obtiene el color de marca de agua para un estado de documento
 * @param {string} documentStatus - Estado del documento
 * @returns {Object} Color RGB
 */
function getWatermarkColor(documentStatus) {
  switch (documentStatus) {
    case DOCUMENT_STATUS.SIGNED:
      return COLORS.WATERMARK_SIGNED;
    case DOCUMENT_STATUS.REJECTED:
      return COLORS.WATERMARK_REJECTED;
    case DOCUMENT_STATUS.PENDING:
    default:
      return COLORS.WATERMARK_PENDING;
  }
}

/**
 * Traduce un estado de firma al español
 * @param {string} status - Estado en inglés
 * @returns {string} Estado en español
 */
function translateStatus(status) {
  switch (status) {
    case SIGNATURE_STATUS.SIGNED:
      return 'Firmado';
    case SIGNATURE_STATUS.REJECTED:
      return 'Rechazado';
    case SIGNATURE_STATUS.PENDING:
    default:
      return 'Pendiente';
  }
}

/**
 * Formatea una fecha a formato legible en español
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha formateada
 */
function formatDate(date) {
  if (!date) return 'N/A';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota'
  };

  try {
    return dateObj.toLocaleDateString('es-CO', options);
  } catch (error) {
    return dateObj.toISOString();
  }
}

/**
 * Formatea una fecha a formato corto
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha formateada (dd/mm/yyyy HH:mm)
 */
function formatDateShort(date) {
  if (!date) return 'N/A';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Trunca un texto a cierto número de caracteres
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string} Texto truncado
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Calcula el ancho de un texto con una fuente y tamaño específico
 * @param {string} text - Texto a medir
 * @param {Object} font - Fuente de pdf-lib
 * @param {number} size - Tamaño de fuente
 * @returns {number} Ancho en puntos
 */
function getTextWidth(text, font, size) {
  if (!text || !font) return 0;
  return font.widthOfTextAtSize(text, size);
}

/**
 * Divide un texto largo en múltiples líneas
 * @param {string} text - Texto a dividir
 * @param {Object} font - Fuente de pdf-lib
 * @param {number} fontSize - Tamaño de fuente
 * @param {number} maxWidth - Ancho máximo permitido
 * @returns {Array<string>} Array de líneas
 */
function wrapText(text, font, fontSize, maxWidth) {
  if (!text) return [''];

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = getTextWidth(testLine, font, fontSize);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Ordena firmantes por order_position
 * @param {Array} signers - Array de firmantes
 * @returns {Array} Firmantes ordenados
 */
function sortSigners(signers) {
  if (!signers || !Array.isArray(signers)) return [];
  return [...signers].sort((a, b) => a.order_position - b.order_position);
}

/**
 * Sanitiza texto para evitar problemas en el PDF
 * @param {string} text - Texto a sanitizar
 * @returns {string} Texto sanitizado
 */
function sanitizeText(text) {
  if (!text) return '';

  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remover caracteres de control
    .replace(/\t/g, ' ')                          // Reemplazar tabs
    .replace(/\r\n/g, '\n')                       // Normalizar saltos de línea
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Verifica si una posición Y está fuera de la página y necesita una nueva página
 * @param {number} yPosition - Posición Y actual
 * @param {number} margin - Margen inferior
 * @param {number} requiredSpace - Espacio requerido
 * @returns {boolean} True si necesita nueva página
 */
function needsNewPage(yPosition, margin, requiredSpace = 50) {
  return yPosition < (margin + requiredSpace);
}

/**
 * Calcula el centro horizontal de la página
 * @param {number} pageWidth - Ancho de la página
 * @param {number} contentWidth - Ancho del contenido
 * @returns {number} Posición X para centrar
 */
function getCenterX(pageWidth, contentWidth) {
  return (pageWidth - contentWidth) / 2;
}

module.exports = {
  getDocumentStatus,
  getStatusColor,
  getStatusBackgroundColor,
  getWatermarkColor,
  translateStatus,
  formatDate,
  formatDateShort,
  truncateText,
  getTextWidth,
  wrapText,
  sortSigners,
  sanitizeText,
  needsNewPage,
  getCenterX
};
