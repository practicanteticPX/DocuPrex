/**
 * Renderizador de plantillas de email
 * Carga plantillas HTML y las renderiza con datos dinámicos
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Renderiza una plantilla con datos
 * Reemplaza placeholders {{variable}} con valores reales
 * @param {string} template - Contenido HTML de la plantilla
 * @param {Object} data - Datos a insertar en la plantilla
 * @returns {string} HTML renderizado
 */
function renderTemplate(template, data) {
  let rendered = template;

  // Reemplazar cada placeholder con su valor
  Object.keys(data).forEach(key => {
    const placeholder = new RegExp(`{{${key}}}`, 'g');
    const value = data[key] !== undefined && data[key] !== null ? data[key] : '';
    rendered = rendered.replace(placeholder, value);
  });

  return rendered;
}

/**
 * Carga una plantilla de email desde el filesystem
 * @param {string} templateName - Nombre de la plantilla (sin extensión)
 * @returns {Promise<string>} Contenido HTML de la plantilla
 */
async function loadTemplate(templateName) {
  try {
    const templatePath = path.join(__dirname, `${templateName}.html`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    return templateContent;
  } catch (error) {
    console.error(`Error cargando plantilla ${templateName}:`, error);
    throw new Error(`No se pudo cargar la plantilla de email: ${templateName}`);
  }
}

/**
 * Renderiza la plantilla de asignación de firmante
 * @param {Object} data - Datos del email
 * @param {string} data.nombreFirmante - Nombre del firmante
 * @param {string} data.nombreDocumento - Nombre del documento
 * @param {string} data.documentoUrl - URL del documento
 * @param {string} data.creadorDocumento - Nombre del creador
 * @returns {Promise<string>} HTML renderizado
 */
async function renderSignerAssignedTemplate(data) {
  const template = await loadTemplate('signer-assigned');
  return renderTemplate(template, data);
}

/**
 * Renderiza la plantilla de documento firmado
 * @param {Object} data - Datos del email
 * @param {string} data.creadorDocumento - Nombre del creador
 * @param {string} data.nombreDocumento - Nombre del documento
 * @param {string} data.documentoUrl - URL del documento
 * @param {number} data.totalFirmantes - Total de firmantes
 * @returns {Promise<string>} HTML renderizado
 */
async function renderDocumentSignedTemplate(data) {
  const template = await loadTemplate('document-signed');
  return renderTemplate(template, data);
}

/**
 * Renderiza la plantilla de documento rechazado
 * @param {Object} data - Datos del email
 * @param {string} data.creadorDocumento - Nombre del creador
 * @param {string} data.nombreDocumento - Nombre del documento
 * @param {string} data.documentoUrl - URL del documento
 * @param {string} data.nombreFirmante - Nombre del firmante que rechazó
 * @param {string} data.razonRechazo - Razón del rechazo
 * @param {string} data.fechaRechazo - Fecha del rechazo
 * @returns {Promise<string>} HTML renderizado
 */
async function renderDocumentRejectedTemplate(data) {
  const template = await loadTemplate('document-rejected');
  return renderTemplate(template, data);
}

/**
 * Renderiza una plantilla genérica
 * @param {string} templateName - Nombre de la plantilla
 * @param {Object} data - Datos para la plantilla
 * @returns {Promise<string>} HTML renderizado
 */
async function render(templateName, data) {
  const template = await loadTemplate(templateName);
  return renderTemplate(template, data);
}

module.exports = {
  render,
  renderTemplate,
  loadTemplate,
  renderSignerAssignedTemplate,
  renderDocumentSignedTemplate,
  renderDocumentRejectedTemplate
};
