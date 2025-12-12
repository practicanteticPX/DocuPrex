/**
 * Constantes para generación de PDFs
 * Centraliza todos los valores constantes usados en la generación de PDFs
 */

const { rgb } = require('pdf-lib');

// ============================================
// DIMENSIONES DE PÁGINA
// ============================================
const PAGE_DIMENSIONS = {
  // A4 en puntos (72 puntos = 1 pulgada)
  WIDTH: 595.28,
  HEIGHT: 841.89,
  MARGIN: 60,
  MARGIN_TOP: 70,
  MARGIN_BOTTOM: 50
};

// ============================================
// TAMAÑOS DE FUENTE
// ============================================
const FONT_SIZES = {
  TITLE: 16,
  SUBTITLE: 12,
  HEADING: 11,
  BODY: 9,
  SMALL: 8,
  WATERMARK: 110
};

// ============================================
// COLORES
// ============================================
const COLORS = {
  // Colores base
  WHITE: rgb(1, 1, 1),
  BLACK: rgb(0.05, 0.05, 0.05),
  GRAY_DARK: rgb(0.3, 0.3, 0.3),
  GRAY_MEDIUM: rgb(0.5, 0.5, 0.5),
  GRAY_LIGHT: rgb(0.85, 0.85, 0.85),
  GRAY_VERY_LIGHT: rgb(0.95, 0.95, 0.95),

  // Colores de estado (texto)
  SIGNED: rgb(0.0, 0.5, 0.0),      // Verde oscuro
  PENDING: rgb(0.4, 0.4, 0.4),     // Gris oscuro
  REJECTED: rgb(0.4, 0.4, 0.4),    // Gris oscuro

  // Colores de marca de agua (transparentes)
  WATERMARK_SIGNED: rgb(0.72, 0.94, 0.82),    // Verde muy claro
  WATERMARK_PENDING: rgb(0.9, 0.9, 0.9),      // Gris muy claro
  WATERMARK_REJECTED: rgb(0.9, 0.9, 0.9),     // Gris muy claro

  // Colores de fondo
  BG_SIGNED: rgb(0.9, 0.97, 0.93),      // Verde muy claro
  BG_PENDING: rgb(0.95, 0.95, 0.95),    // Gris muy claro
  BG_REJECTED: rgb(0.95, 0.95, 0.95),   // Gris muy claro

  // Color de encabezado de tabla
  TABLE_HEADER: rgb(0.95, 0.95, 0.95)
};

// ============================================
// ESTADOS DE DOCUMENTO
// ============================================
const DOCUMENT_STATUS = {
  SIGNED: 'FIRMADO',
  PENDING: 'PENDIENTE',
  REJECTED: 'RECHAZADO'
};

// ============================================
// ESTADOS DE FIRMA
// ============================================
const SIGNATURE_STATUS = {
  SIGNED: 'signed',
  PENDING: 'pending',
  REJECTED: 'rejected'
};

// ============================================
// ETIQUETAS
// ============================================
const LABELS = {
  TITLE: 'Informe de Firmas',
  TIMEZONE_LABEL: 'Fechas y horas en UTC-0500 (America/Bogota)',
  DOCUMENT_INFO_TITLE: 'Información del Documento',
  SIGNERS_INFO_TITLE: 'Información de Firmantes',
  SIGNER_LABEL: 'Firmante',
  NAME_LABEL: 'Nombre',
  EMAIL_LABEL: 'Correo Electrónico',
  STATUS_LABEL: 'Estado',
  DATE_LABEL: 'Fecha',
  REASON_LABEL: 'Razón de Rechazo',
  CONSECUTIVO_LABEL: 'Consecutivo',
  ORDER_LABEL: 'Orden',
  FILE_NAME_LABEL: 'Nombre del Archivo',
  UPLOADED_BY_LABEL: 'Subido por',
  CREATED_AT_LABEL: 'Fecha de Creación',
  ROLE_LABEL: 'Rol'
};

// ============================================
// ESPACIADO
// ============================================
const SPACING = {
  LINE_HEIGHT: 18,
  SECTION_SPACING: 25,
  PARAGRAPH_SPACING: 15,
  TABLE_ROW_HEIGHT: 30,
  TABLE_CELL_PADDING: 5
};

// ============================================
// WATERMARK (MARCA DE AGUA)
// ============================================
const WATERMARK = {
  SIZE: 110,
  ROTATION_ANGLE: -55,
  OPACITY: 0.3,
  Y_OFFSET: 240  // Offset desde el centro de la página
};

// ============================================
// TABLE (TABLA)
// ============================================
const TABLE = {
  HEADER_HEIGHT: 25,
  ROW_HEIGHT: 30,
  CELL_PADDING: 5,
  BORDER_WIDTH: 0.5
};

module.exports = {
  PAGE_DIMENSIONS,
  FONT_SIZES,
  COLORS,
  DOCUMENT_STATUS,
  SIGNATURE_STATUS,
  LABELS,
  SPACING,
  WATERMARK,
  TABLE
};
