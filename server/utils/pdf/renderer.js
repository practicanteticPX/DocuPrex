/**
 * Funciones de renderizado para componentes del PDF
 * Renderiza elementos específicos como marcas de agua, títulos, tablas, etc.
 */

const {
  PAGE_DIMENSIONS,
  FONT_SIZES,
  COLORS,
  LABELS,
  SPACING,
  WATERMARK
} = require('./constants');
const {
  getWatermarkColor,
  formatDate,
  formatDateShort,
  getTextWidth,
  getCenterX
} = require('./helpers');

/**
 * Dibuja una marca de agua rotada en la página
 * @param {Object} page - Página de pdf-lib
 * @param {string} text - Texto de la marca de agua
 * @param {Object} font - Fuente de pdf-lib
 * @param {string} documentStatus - Estado del documento
 */
function drawWatermark(page, text, font, documentStatus) {
  const watermarkColor = getWatermarkColor(documentStatus);
  const watermarkWidth = getTextWidth(text, font, WATERMARK.SIZE);
  const watermarkRotatedWidth = watermarkWidth * Math.cos(45 * Math.PI / 180);
  const watermarkY = PAGE_DIMENSIONS.HEIGHT / 2 + WATERMARK.Y_OFFSET;

  page.drawText(text, {
    x: (PAGE_DIMENSIONS.WIDTH - watermarkRotatedWidth) / 2,
    y: watermarkY,
    size: WATERMARK.SIZE,
    font: font,
    color: watermarkColor,
    rotate: { angle: WATERMARK.ROTATION_ANGLE, type: 'degrees' },
    opacity: WATERMARK.OPACITY
  });
}

/**
 * Dibuja el título principal de la página
 * @param {Object} page - Página de pdf-lib
 * @param {Object} fontBold - Fuente bold de pdf-lib
 * @param {number} yPosition - Posición Y inicial
 * @returns {number} Nueva posición Y
 */
function drawTitle(page, fontBold, yPosition) {
  page.drawText(LABELS.TITLE, {
    x: PAGE_DIMENSIONS.MARGIN,
    y: yPosition,
    size: FONT_SIZES.TITLE,
    font: fontBold,
    color: COLORS.BLACK
  });

  return yPosition - SPACING.SECTION_SPACING;
}

/**
 * Dibuja la etiqueta de zona horaria
 * @param {Object} page - Página de pdf-lib
 * @param {Object} fontRegular - Fuente regular de pdf-lib
 * @param {number} yPosition - Posición Y
 * @returns {number} Nueva posición Y
 */
function drawTimezoneLabel(page, fontRegular, yPosition) {
  page.drawText(LABELS.TIMEZONE_LABEL, {
    x: PAGE_DIMENSIONS.MARGIN,
    y: yPosition,
    size: FONT_SIZES.SMALL,
    font: fontRegular,
    color: COLORS.GRAY_MEDIUM
  });

  return yPosition - SPACING.LINE_HEIGHT;
}

/**
 * Dibuja la fecha actual de generación
 * @param {Object} page - Página de pdf-lib
 * @param {Object} fontRegular - Fuente regular de pdf-lib
 * @param {number} yPosition - Posición Y
 * @returns {number} Nueva posición Y
 */
function drawGenerationDate(page, fontRegular, yPosition) {
  const currentDate = formatDate(new Date());

  page.drawText(`Generado el: ${currentDate}`, {
    x: PAGE_DIMENSIONS.MARGIN,
    y: yPosition,
    size: FONT_SIZES.SMALL,
    font: fontRegular,
    color: COLORS.GRAY_MEDIUM
  });

  return yPosition - SPACING.SECTION_SPACING;
}

/**
 * Dibuja una línea separadora
 * @param {Object} page - Página de pdf-lib
 * @param {number} yPosition - Posición Y
 * @param {number} margin - Margen (opcional)
 * @returns {number} Nueva posición Y
 */
function drawSeparatorLine(page, yPosition, margin = PAGE_DIMENSIONS.MARGIN) {
  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: PAGE_DIMENSIONS.WIDTH - margin, y: yPosition },
    thickness: 1,
    color: COLORS.GRAY_LIGHT
  });

  return yPosition - SPACING.PARAGRAPH_SPACING;
}

/**
 * Dibuja un encabezado de sección
 * @param {Object} page - Página de pdf-lib
 * @param {string} title - Título de la sección
 * @param {Object} fontBold - Fuente bold de pdf-lib
 * @param {number} yPosition - Posición Y
 * @returns {number} Nueva posición Y
 */
function drawSectionHeader(page, title, fontBold, yPosition) {
  page.drawText(title, {
    x: PAGE_DIMENSIONS.MARGIN,
    y: yPosition,
    size: FONT_SIZES.SUBTITLE,
    font: fontBold,
    color: COLORS.BLACK
  });

  return yPosition - SPACING.PARAGRAPH_SPACING;
}

/**
 * Dibuja un campo de información (etiqueta: valor)
 * @param {Object} page - Página de pdf-lib
 * @param {string} label - Etiqueta
 * @param {string} value - Valor
 * @param {Object} fontBold - Fuente bold
 * @param {Object} fontRegular - Fuente regular
 * @param {number} yPosition - Posición Y
 * @returns {number} Nueva posición Y
 */
function drawInfoField(page, label, value, fontBold, fontRegular, yPosition) {
  const labelWidth = getTextWidth(label, fontBold, FONT_SIZES.BODY);

  page.drawText(label, {
    x: PAGE_DIMENSIONS.MARGIN,
    y: yPosition,
    size: FONT_SIZES.BODY,
    font: fontBold,
    color: COLORS.GRAY_DARK
  });

  page.drawText(value || 'N/A', {
    x: PAGE_DIMENSIONS.MARGIN + labelWidth + 5,
    y: yPosition,
    size: FONT_SIZES.BODY,
    font: fontRegular,
    color: COLORS.BLACK
  });

  return yPosition - SPACING.LINE_HEIGHT;
}

/**
 * Dibuja la información del documento
 * @param {Object} page - Página de pdf-lib
 * @param {Object} documentInfo - Información del documento
 * @param {Object} fontBold - Fuente bold
 * @param {Object} fontRegular - Fuente regular
 * @param {number} yPosition - Posición Y inicial
 * @returns {number} Nueva posición Y
 */
function drawDocumentInfo(page, documentInfo, fontBold, fontRegular, yPosition) {
  // Título de sección
  yPosition = drawSectionHeader(page, LABELS.DOCUMENT_INFO_TITLE, fontBold, yPosition);

  // Campos de información
  yPosition = drawInfoField(
    page,
    `${LABELS.FILE_NAME_LABEL}: `,
    documentInfo.fileName || documentInfo.title,
    fontBold,
    fontRegular,
    yPosition
  );

  yPosition = drawInfoField(
    page,
    `${LABELS.UPLOADED_BY_LABEL}: `,
    documentInfo.uploadedBy || 'N/A',
    fontBold,
    fontRegular,
    yPosition
  );

  yPosition = drawInfoField(
    page,
    `${LABELS.CREATED_AT_LABEL}: `,
    formatDate(documentInfo.createdAt),
    fontBold,
    fontRegular,
    yPosition
  );

  return yPosition - SPACING.SECTION_SPACING;
}

/**
 * Dibuja un rectángulo de fondo para una fila
 * @param {Object} page - Página de pdf-lib
 * @param {number} x - Posición X
 * @param {number} y - Posición Y
 * @param {number} width - Ancho
 * @param {number} height - Alto
 * @param {Object} color - Color RGB
 */
function drawRowBackground(page, x, y, width, height, color) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color
  });
}

/**
 * Dibuja un texto centrado
 * @param {Object} page - Página de pdf-lib
 * @param {string} text - Texto a dibujar
 * @param {number} yPosition - Posición Y
 * @param {Object} font - Fuente
 * @param {number} fontSize - Tamaño de fuente
 * @param {Object} color - Color
 */
function drawCenteredText(page, text, yPosition, font, fontSize, color) {
  const textWidth = getTextWidth(text, font, fontSize);
  const xPosition = getCenterX(PAGE_DIMENSIONS.WIDTH, textWidth);

  page.drawText(text, {
    x: xPosition,
    y: yPosition,
    size: fontSize,
    font,
    color
  });
}

/**
 * Dibuja un badge de estado
 * @param {Object} page - Página de pdf-lib
 * @param {string} status - Estado
 * @param {number} x - Posición X
 * @param {number} y - Posición Y
 * @param {Object} font - Fuente
 * @param {Object} textColor - Color del texto
 * @param {Object} bgColor - Color de fondo
 */
function drawStatusBadge(page, status, x, y, font, textColor, bgColor) {
  const text = status.toUpperCase();
  const padding = 8;
  const textWidth = getTextWidth(text, font, FONT_SIZES.SMALL);
  const badgeWidth = textWidth + (padding * 2);
  const badgeHeight = 16;

  // Fondo del badge
  page.drawRectangle({
    x: x - padding,
    y: y - 4,
    width: badgeWidth,
    height: badgeHeight,
    color: bgColor,
    borderColor: textColor,
    borderWidth: 0.5
  });

  // Texto del badge
  page.drawText(text, {
    x,
    y,
    size: FONT_SIZES.SMALL,
    font,
    color: textColor
  });
}

module.exports = {
  drawWatermark,
  drawTitle,
  drawTimezoneLabel,
  drawGenerationDate,
  drawSeparatorLine,
  drawSectionHeader,
  drawInfoField,
  drawDocumentInfo,
  drawRowBackground,
  drawCenteredText,
  drawStatusBadge
};
