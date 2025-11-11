-- ==================================================
-- Migración: Agregar columna email_notifications a tabla users
-- Fecha: 2025-11-11
-- Descripción: Permite a los usuarios habilitar/deshabilitar notificaciones por email
-- ==================================================

-- Agregar columna email_notifications si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'email_notifications'
    ) THEN
        ALTER TABLE users
        ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE;

        RAISE NOTICE 'Columna email_notifications agregada exitosamente';
    ELSE
        RAISE NOTICE 'La columna email_notifications ya existe';
    END IF;
END
$$;

-- Comentario en la columna
COMMENT ON COLUMN users.email_notifications IS 'Indica si el usuario desea recibir notificaciones por email';

-- Verificar que la columna se agregó correctamente
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'email_notifications';
