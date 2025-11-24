-- Migración: Agregar columna para rastrear cuándo se envió el último recordatorio
-- Fecha: 2025-01-XX
-- Descripción: Agrega la columna last_reminder_sent_at a la tabla signatures
--              para controlar la frecuencia de los recordatorios automáticos

-- Agregar columna para timestamp del último recordatorio enviado
ALTER TABLE signatures
ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP WITH TIME ZONE;

-- Crear índice para mejorar el rendimiento de las consultas de recordatorios
CREATE INDEX IF NOT EXISTS idx_signatures_reminder_lookup
ON signatures (status, last_reminder_sent_at, created_at)
WHERE status = 'pending';

-- Comentarios para documentación
COMMENT ON COLUMN signatures.last_reminder_sent_at IS 'Timestamp de cuándo se envió el último recordatorio por correo al firmante';
COMMENT ON INDEX idx_signatures_reminder_lookup IS 'Índice para optimizar búsquedas de firmas que requieren recordatorios';
