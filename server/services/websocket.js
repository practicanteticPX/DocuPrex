/**
 * WebSocket Service - Centraliza la lógica de Socket.IO
 *
 * Este servicio permite emitir eventos en tiempo real a todos los clientes conectados
 * cuando ocurren cambios en documentos (firma, rechazo, eliminación).
 *
 * Patrón Singleton: Solo existe una instancia del servidor Socket.IO
 */

let io = null;

/**
 * Inicializa el servidor Socket.IO
 * @param {SocketIO.Server} socketIO - Instancia del servidor Socket.IO
 */
function initialize(socketIO) {
  if (io) {
    console.warn('⚠️ WebSocket Service ya estaba inicializado');
    return;
  }

  io = socketIO;

  // Event handlers para conexión/desconexión
  io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
  });

  console.log('🔌 WebSocket Service inicializado correctamente');
}

/**
 * Emite un evento cuando un documento es firmado
 * @param {number} documentId - ID del documento firmado
 * @param {object} data - Datos adicionales del evento
 */
function emitDocumentSigned(documentId, data = {}) {
  if (!io) return;
  io.emit('document:signed', { documentId, timestamp: Date.now(), ...data });
}

function emitDocumentRejected(documentId, data = {}) {
  if (!io) return;
  io.emit('document:rejected', { documentId, timestamp: Date.now(), ...data });
}

function emitDocumentDeleted(documentId, data = {}) {
  if (!io) return;
  io.emit('document:deleted', { documentId, timestamp: Date.now(), ...data });
}

function emitDocumentUpdated(documentId, action, data = {}) {
  if (!io) return;
  io.emit('document:updated', { documentId, action, timestamp: Date.now(), ...data });
}

function emitNotificationCreated(userId, notification = {}) {
  if (!io) return;
  io.emit('notification:created', { userId, notification, timestamp: Date.now() });
}

function emitNotificationDeleted(documentId = null, notificationId = null, userId = null, type = null) {
  if (!io) return;
  io.emit('notification:deleted', { documentId, notificationId, userId, type, timestamp: Date.now() });
}

function emitNotificationRead(notificationId, userId) {
  if (!io) return;
  io.emit('notification:read', { notificationId, userId, timestamp: Date.now() });
}

function emitAllNotificationsRead(userId) {
  if (!io) return;
  io.emit('notification:all_read', { userId, timestamp: Date.now() });
}

function emitDocumentRetained(documentId, data = {}) {
  if (!io) return;
  io.emit('document:retained', { documentId, timestamp: Date.now(), ...data });
}

/**
 * Emite un evento cuando las sesiones activas cambian (para el panel de admin)
 * @param {object} data - Datos de las sesiones actualizadas
 */
function emitSessionsUpdated(data = {}) {
  if (!io) return;
  io.emit('sessions:updated', { timestamp: Date.now(), ...data });
}

/**
 * Emite un evento cuando una sesión específica es cerrada (fuerza logout del usuario)
 * @param {number} userId - ID del usuario cuya sesión fue cerrada
 * @param {number} sessionId - ID de la sesión cerrada
 */
function emitSessionClosed(userId, sessionId) {
  if (!io) return;
  io.emit('session:closed', { userId, sessionId, timestamp: Date.now() });
}

module.exports = {
  initialize,
  emitDocumentSigned,
  emitDocumentRejected,
  emitDocumentDeleted,
  emitDocumentUpdated,
  emitNotificationCreated,
  emitNotificationDeleted,
  emitNotificationRead,
  emitAllNotificationsRead,
  emitDocumentRetained,
  emitSessionsUpdated,
  emitSessionClosed
};
