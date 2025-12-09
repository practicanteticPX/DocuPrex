-- Script para agregar constraint único a notifications
-- Esto previene notificaciones duplicadas a nivel de base de datos

-- Primero, eliminar duplicados existentes si los hay
-- Mantener solo la notificación más reciente de cada grupo duplicado
DELETE FROM notifications a
USING notifications b
WHERE a.user_id = b.user_id
  AND a.type = b.type
  AND a.document_id = b.document_id
  AND a.id < b.id;

-- Ahora crear el constraint único
-- Esto asegura que no puede haber dos notificaciones del mismo tipo para el mismo usuario y documento
ALTER TABLE notifications
ADD CONSTRAINT notifications_user_type_document_unique
UNIQUE (user_id, type, document_id);
