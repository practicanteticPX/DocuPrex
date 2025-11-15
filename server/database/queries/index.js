/**
 * Exportación centralizada de queries SQL
 * Punto de entrada único para todas las queries de la base de datos
 */

const userQueries = require('./users.queries');
const documentQueries = require('./documents.queries');
const signatureQueries = require('./signatures.queries');
const notificationQueries = require('./notifications.queries');
const documentTypeQueries = require('./documentTypes.queries');
const auditQueries = require('./audit.queries');

module.exports = {
  // Queries de usuarios
  users: userQueries,

  // Queries de documentos
  documents: documentQueries,

  // Queries de firmas
  signatures: signatureQueries,

  // Queries de notificaciones
  notifications: notificationQueries,

  // Queries de tipos de documentos
  documentTypes: documentTypeQueries,

  // Queries de auditoría
  audit: auditQueries
};
