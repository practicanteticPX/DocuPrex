-- ========================================
-- SCRIPT SQL PARA RESETEAR LA BASE DE DATOS
-- ========================================
--
-- ⚠️ ADVERTENCIA: Este script elimina TODOS los datos
--
-- Uso en psql o pgAdmin:
-- 1. Conéctate a la base de datos
-- 2. Ejecuta este script completo
--
-- ========================================

-- Deshabilitar foreign keys temporalmente
SET session_replication_role = replica;

-- Limpiar todas las tablas en orden
TRUNCATE TABLE audit_log RESTART IDENTITY CASCADE;
TRUNCATE TABLE notifications RESTART IDENTITY CASCADE;
TRUNCATE TABLE signatures RESTART IDENTITY CASCADE;
TRUNCATE TABLE document_signers RESTART IDENTITY CASCADE;
TRUNCATE TABLE documents RESTART IDENTITY CASCADE;
TRUNCATE TABLE users RESTART IDENTITY CASCADE;

-- Rehabilitar foreign keys
SET session_replication_role = DEFAULT;

-- Crear usuario administrador
-- Contraseña: admin123 (hash bcrypt)
INSERT INTO users (name, email, password_hash, role, is_active)
VALUES (
  'Administrador',
  'admin@prexxa.local',
  '$2a$10$YourHashHere', -- Nota: Este hash debe generarse con bcrypt
  'admin',
  true
);

-- Verificar resultados
SELECT 'TABLAS LIMPIADAS:' as mensaje;
SELECT 'users' as tabla, COUNT(*) as registros FROM users
UNION ALL
SELECT 'documents', COUNT(*) FROM documents
UNION ALL
SELECT 'signatures', COUNT(*) FROM signatures
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'audit_log', COUNT(*) FROM audit_log;

-- Mostrar usuario creado
SELECT 'USUARIO ADMINISTRADOR CREADO:' as mensaje;
SELECT id, name, email, role FROM users WHERE role = 'admin';

-- ========================================
-- NOTAS IMPORTANTES:
-- ========================================
-- 1. Este script NO elimina archivos físicos del servidor
-- 2. Debes eliminar manualmente la carpeta 'uploads/' si lo deseas
-- 3. Para generar el hash de contraseña correcto, usa el script de Node.js
--    o ejecuta: node -e "console.log(require('bcryptjs').hashSync('admin123', 10))"
-- ========================================
