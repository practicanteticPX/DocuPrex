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
    console.log('✅ Cliente WebSocket conectado:', socket.id);

    socket.on('disconnect', () => {
      console.log('❌ Cliente WebSocket desconectado:', socket.id);
    });
  });

  console.log('🔌 WebSocket Service inicializado correctamente');
}

/**
 * Emite un evento cuando un documento es firmado
 * @param {number} documentId - ID del documento firmado
 * @param {object} data - Datos adicionales del evento
 */
function emitDocumentSigned(documentId, data = {}) {
  if (!io) {
    console.error('❌ WebSocket Service no inicializado');
    return;
  }

  console.log('📤 Emitiendo evento: document:signed para documento', documentId);
  io.emit('document:signed', {
    documentId,
    timestamp: Date.now(),
    ...data
  });
}

/**
 * Emite un evento cuando un documento es rechazado
 * @param {number} documentId - ID del documento rechazado
 * @param {object} data - Datos adicionales del evento
 */
function emitDocumentRejected(documentId, data = {}) {
  if (!io) {
    console.error('❌ WebSocket Service no inicializado');
    return;
  }

  console.log('📤 Emitiendo evento: document:rejected para documento', documentId);
  io.emit('document:rejected', {
    documentId,
    timestamp: Date.now(),
    ...data
  });
}

/**
 * Emite un evento cuando un documento es eliminado
 * @param {number} documentId - ID del documento eliminado
 * @param {object} data - Datos adicionales del evento
 */
function emitDocumentDeleted(documentId, data = {}) {
  if (!io) {
    console.error('❌ WebSocket Service no inicializado');
    return;
  }

  console.log('📤 Emitiendo evento: document:deleted para documento', documentId);
  io.emit('document:deleted', {
    documentId,
    timestamp: Date.now(),
    ...data
  });
}

/**
 * Emite un evento cuando se actualiza un documento (genérico)
 * @param {number} documentId - ID del documento actualizado
 * @param {string} action - Acción realizada
 * @param {object} data - Datos adicionales del evento
 */
function emitDocumentUpdated(documentId, action, data = {}) {
  if (!io) {
    console.error('❌ WebSocket Service no inicializado');
    return;
  }

  console.log('📤 Emitiendo evento: document:updated para documento', documentId, 'acción:', action);
  io.emit('document:updated', {
    documentId,
    action,
    timestamp: Date.now(),
    ...data
  });
}

/**
 * Emite un evento cuando se crea una notificación
 * @param {number} userId - ID del usuario destinatario
 * @param {object} notification - Datos de la notificación creada
 */
function emitNotificationCreated(userId, notification = {}) {
  if (!io) {
    console.error('❌ WebSocket Service no inicializado');
    return;
  }

  console.log('📤 Emitiendo evento: notification:created para usuario', userId);
  io.emit('notification:created', {
    userId,
    notification,
    timestamp: Date.now()
  });
}

/**
 * Emite un evento cuando se elimina una notificación o todas las notificaciones de un documento
 * @param {number} documentId - ID del documento (si se eliminan por documento)
 * @param {number} notificationId - ID de la notificación específica (si se elimina una sola)
 * @param {number} userId - ID del usuario afectado (opcional, para filtrar en frontend)
 * @param {string} type - Tipo de notificación eliminada (opcional, para filtrar en frontend)
 */
function emitNotificationDeleted(documentId = null, notificationId = null, userId = null, type = null) {
  if (!io) {
    console.error('❌ WebSocket Service no inicializado');
    return;
  }

  console.log('📤 Emitiendo evento: notification:deleted', { documentId, notificationId, userId, type });
  io.emit('notification:deleted', {
    documentId,
    notificationId,
    userId,
    type,
    timestamp: Date.now()
  });
}

/**
 * Emite un evento cuando se marca una notificación como leída
 * @param {number} notificationId - ID de la notificación marcada como leída
 * @param {number} userId - ID del usuario que marcó como leída
 */
function emitNotificationRead(notificationId, userId) {
  if (!io) {
    console.error('❌ WebSocket Service no inicializado');
    return;
  }

  console.log('📤 Emitiendo evento: notification:read', { notificationId, userId });
  io.emit('notification:read', {
    notificationId,
    userId,
    timestamp: Date.now()
  });
}

/**
 * Emite un evento cuando se marcan todas las notificaciones de un usuario como leídas
 * @param {number} userId - ID del usuario que marcó todas como leídas
 */
function emitAllNotificationsRead(userId) {
  if (!io) {
    console.error('❌ WebSocket Service no inicializado');
    return;
  }

  console.log('📤 Emitiendo evento: notification:all_read para usuario', userId);
  io.emit('notification:all_read', {
    userId,
    timestamp: Date.now()
  });
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
  emitAllNotificationsRead
};
