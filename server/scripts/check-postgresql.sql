-- Script de verificación y optimización para PostgreSQL
-- Ejecutar este script para verificar la configuración actual

-- ========================================
-- 1. VERIFICAR CONEXIONES ACTUALES
-- ========================================
SELECT
    'Conexiones Activas' as metric,
    count(*) as current_value,
    (SELECT setting::int FROM pg_settings WHERE name='max_connections') as max_allowed,
    round((count(*) / (SELECT setting::int FROM pg_settings WHERE name='max_connections')::numeric) * 100, 2) as percent_used
FROM pg_stat_activity
UNION ALL
-- Conexiones por base de datos
SELECT
    'Conexiones por DB: ' || datname as metric,
    count(*) as current_value,
    NULL as max_allowed,
    NULL as percent_used
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname;

-- ========================================
-- 2. VERIFICAR CONFIGURACIÓN ACTUAL
-- ========================================
SELECT
    name as parametro,
    setting as valor_actual,
    unit as unidad,
    context as requiere_reinicio
FROM pg_settings
WHERE name IN (
    'max_connections',
    'shared_buffers',
    'effective_cache_size',
    'work_mem',
    'maintenance_work_mem',
    'checkpoint_completion_target',
    'wal_buffers',
    'default_statistics_target',
    'random_page_cost',
    'effective_io_concurrency'
)
ORDER BY name;

-- ========================================
-- 3. VERIFICAR ÍNDICES NECESARIOS
-- ========================================
-- Verificar si existen los índices importantes
SELECT
    'Índice: ' || indexname as nombre,
    CASE WHEN indexname IS NOT NULL THEN 'OK' ELSE 'FALTA' END as estado
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname IN (
    'idx_notifications_user_unread',
    'idx_notifications_user_id',
    'idx_document_signers_order',
    'idx_signatures_status'
);

-- ========================================
-- 4. ESTADÍSTICAS DE USO DE TABLAS
-- ========================================
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as tamaño,
    n_live_tup as filas_vivas,
    n_dead_tup as filas_muertas,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- ========================================
-- 5. QUERIES LENTAS ACTIVAS
-- ========================================
SELECT
    pid,
    usename,
    datname,
    state,
    EXTRACT(EPOCH FROM (now() - query_start)) as duracion_segundos,
    left(query, 100) as query_truncada
FROM pg_stat_activity
WHERE state != 'idle'
AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duracion_segundos DESC;

-- ========================================
-- 6. RECOMENDACIONES DE CONFIGURACIÓN
-- ========================================
-- Esta sección muestra recomendaciones basadas en el sistema actual

-- Calcular RAM disponible (necesitas ejecutar esto en tu servidor)
-- Para 40 usuarios concurrentes con 50 conexiones:
/*
CONFIGURACIÓN RECOMENDADA para servidor con:
- 4GB RAM: max_connections=100, shared_buffers=1GB, work_mem=4MB
- 8GB RAM: max_connections=100, shared_buffers=2GB, work_mem=8MB
- 16GB RAM: max_connections=150, shared_buffers=4GB, work_mem=16MB

Editar postgresql.conf:
max_connections = 100
shared_buffers = 1GB  (25% de RAM)
effective_cache_size = 3GB  (75% de RAM)
work_mem = 4MB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1  (para SSD, 4 para HDD)
effective_io_concurrency = 200  (para SSD, 2 para HDD)
*/

-- ========================================
-- 7. LIMPIAR CONEXIONES HUÉRFANAS (CUIDADO!)
-- ========================================
-- DESCOMENTA SOLO SI NECESITAS MATAR CONEXIONES IDLE
-- SELECT pg_terminate_backend(pid)
-- FROM pg_stat_activity
-- WHERE state = 'idle'
-- AND state_change < now() - interval '1 hour';
