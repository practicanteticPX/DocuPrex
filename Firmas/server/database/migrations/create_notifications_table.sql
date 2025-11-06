-- Migración: Crear tabla de notificaciones
-- Fecha: 2025-11-05
-- Descripción: Tabla para almacenar notificaciones de usuarios sobre firmas y rechazos

-- Crear tabla de notificaciones
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    document_title VARCHAR(255) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comentarios explicativos
COMMENT ON TABLE notifications IS 'Notificaciones de usuarios sobre acciones en documentos';
COMMENT ON COLUMN notifications.user_id IS 'Usuario que recibe la notificación';
COMMENT ON COLUMN notifications.type IS 'Tipo de notificación: document_signed, document_rejected, document_rejected_by_other';
COMMENT ON COLUMN notifications.document_id IS 'Documento relacionado con la notificación';
COMMENT ON COLUMN notifications.actor_id IS 'Usuario que realizó la acción';
COMMENT ON COLUMN notifications.document_title IS 'Título del documento (denormalizado para consultas rápidas)';
COMMENT ON COLUMN notifications.is_read IS 'Indica si la notificación fue leída';

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, is_read)
WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_document
ON notifications(document_id);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();
