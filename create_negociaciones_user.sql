-- Crear usuario NEGOCIACIONES si no existe
INSERT INTO users (name, email, role, is_active, email_notifications, created_at, updated_at)
VALUES ('NEGOCIACIONES', 'negociaciones@prexxa.com.co', 'user', true, false, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Verificar que existe
SELECT id, name, email, role FROM users WHERE UPPER(TRIM(name)) = 'NEGOCIACIONES';