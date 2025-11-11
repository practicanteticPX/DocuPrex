-- ==================================================
-- Script de Verificación de Integridad de Base de Datos
-- Sistema de Firmas Digitales
-- ==================================================

\echo '=================================================='
\echo 'VERIFICACIÓN DE INTEGRIDAD DE BASE DE DATOS'
\echo '=================================================='
\echo ''

-- 1. Verificar que todas las tablas existan
\echo '1. TABLAS EXISTENTES:'
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

\echo ''
\echo '2. ESTRUCTURA DE TABLA USERS:'
\d users

\echo ''
\echo '3. ESTADÍSTICAS DE DATOS:'
\echo ''

-- Contar usuarios
SELECT 'Total Usuarios:' as metric, COUNT(*)::text as count FROM users
UNION ALL
SELECT 'Usuarios Activos:', COUNT(*)::text FROM users WHERE is_active = true
UNION ALL
SELECT 'Administradores:', COUNT(*)::text FROM users WHERE role = 'admin'
UNION ALL
SELECT 'Usuarios con Notif. Email:', COUNT(*)::text FROM users WHERE email_notifications = true;

\echo ''

-- Contar documentos
SELECT 'Total Documentos:' as metric, COUNT(*)::text as count FROM documents
UNION ALL
SELECT 'Documentos Pendientes:', COUNT(*)::text FROM documents WHERE status = 'pending'
UNION ALL
SELECT 'Documentos Completados:', COUNT(*)::text FROM documents WHERE status = 'completed'
UNION ALL
SELECT 'Documentos Rechazados:', COUNT(*)::text FROM documents WHERE status = 'rejected';

\echo ''

-- Contar firmas
SELECT 'Total Firmas:' as metric, COUNT(*)::text as count FROM signatures
UNION ALL
SELECT 'Firmas Completadas:', COUNT(*)::text FROM signatures WHERE status = 'signed'
UNION ALL
SELECT 'Firmas Pendientes:', COUNT(*)::text FROM signatures WHERE status = 'pending'
UNION ALL
SELECT 'Firmas Rechazadas:', COUNT(*)::text FROM signatures WHERE status = 'rejected';

\echo ''

-- Contar notificaciones
SELECT 'Total Notificaciones:' as metric, COUNT(*)::text as count FROM notifications
UNION ALL
SELECT 'Notificaciones No Leídas:', COUNT(*)::text FROM notifications WHERE is_read = false
UNION ALL
SELECT 'Notificaciones Leídas:', COUNT(*)::text FROM notifications WHERE is_read = true;

\echo ''
\echo '4. VERIFICACIÓN DE CLAVES FORÁNEAS:'

-- Verificar integridad referencial
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

\echo ''
\echo '5. VERIFICACIÓN DE ÍNDICES:'
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

\echo ''
\echo '6. VERIFICACIÓN DE TRIGGERS:'
SELECT
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

\echo ''
\echo '=================================================='
\echo 'VERIFICACIÓN COMPLETADA'
\echo '=================================================='
