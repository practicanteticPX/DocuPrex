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

module.exports = {
  initialize,
  emitDocumentSigned,
  emitDocumentRejected,
  emitDocumentDeleted,
  emitDocumentUpdated
};
