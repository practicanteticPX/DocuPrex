/**
 * Módulo principal de utilidades PDF
 * Exporta las funciones principales de generación de PDFs
 * Mantiene compatibilidad con código existente
 */

// Re-exportar funciones principales del archivo original pdfCoverPage.js
// Esto mantiene la compatibilidad con el código existente
const {
  addCoverPageWithSigners,
  updateSignersPage
} = require('../pdfCoverPage');

// Exportar módulos nuevos para uso interno
const constants = require('./constants');
const helpers = require('./helpers');
const renderer = require('./renderer');

module.exports = {
  // Funciones principales (compatibilidad con código existente)
  addCoverPageWithSigners,
  updateSignersPage,

  // Módulos nuevos para refactorización futura
  constants,
  helpers,
  renderer
};
