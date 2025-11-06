# Configuración de PostgreSQL para 40+ Usuarios Concurrentes

## Cambios Realizados en la Aplicación

### 1. Rate Limiting **ELIMINADO**
- ✅ Removido completamente el rate limiter de GraphQL
- ✅ Ahora soporta peticiones ilimitadas

### 2. Pool de Conexiones de PostgreSQL **AUMENTADO**
- ✅ `max: 50` conexiones (antes 20)
- ✅ `min: 10` conexiones siempre abiertas
- ✅ `connectionTimeoutMillis: 5000` ms

---

## Configuración Requerida en PostgreSQL

Para que PostgreSQL pueda manejar 50 conexiones simultáneas, necesitas ajustar su configuración:

### 1. Verificar configuración actual
Ejecuta en PostgreSQL:
```sql
SHOW max_connections;
```

### 2. Aumentar max_connections en PostgreSQL

#### En Windows:
1. Localiza el archivo `postgresql.conf` (usualmente en `C:\Program Files\PostgreSQL\16\data\`)
2. Edita con permisos de administrador
3. Busca la línea:
   ```
   max_connections = 100
   ```
4. Si es menor a 100, cámbiala a:
   ```
   max_connections = 100
   ```

#### Parámetros recomendados adicionales:
```conf
# Conexiones
max_connections = 100                    # Suficiente para 50 de la app + 50 de overhead

# Memoria compartida
shared_buffers = 256MB                   # 25% de RAM disponible
effective_cache_size = 1GB               # 50-75% de RAM total

# Work memory (por conexión)
work_mem = 4MB                           # Ajustar según RAM disponible

# Mantenimiento
maintenance_work_mem = 64MB              # Para operaciones de mantenimiento
```

### 3. Reiniciar PostgreSQL
Después de editar `postgresql.conf`:

#### Windows:
```cmd
# Como administrador
net stop postgresql-x64-16
net start postgresql-x64-16
```

O desde Servicios de Windows (services.msc)

---

## Verificación del Sistema

### 1. Verificar límites del sistema operativo

#### Windows:
No hay límites específicos que ajustar, pero asegúrate de tener:
- **RAM suficiente**: Mínimo 4GB, recomendado 8GB+
- **CPU**: Al menos 2 cores

### 2. Monitorear el uso
Ejecuta en PostgreSQL para monitorear conexiones activas:
```sql
SELECT
    count(*) as total_connections,
    max_conn,
    round((count(*) / max_conn::numeric) * 100, 2) as percent_used
FROM
    pg_stat_activity,
    (SELECT setting::int as max_conn FROM pg_settings WHERE name='max_connections') mc
GROUP BY max_conn;
```

---

## Optimizaciones Adicionales (Opcional)

### 1. Índices de Base de Datos
Los siguientes índices ya deberían existir, pero verifica:

```sql
-- Para notificaciones (consultas frecuentes)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- Para documentos pendientes
CREATE INDEX IF NOT EXISTS idx_document_signers_order
ON document_signers(document_id, order_position);

-- Para firmas por estado
CREATE INDEX IF NOT EXISTS idx_signatures_status
ON signatures(document_id, status);
```

### 2. Pooling Externo (Avanzado)
Si experimentas problemas de rendimiento con 40+ usuarios, considera usar **PgBouncer**:
- Pooling a nivel de servidor
- Puede manejar miles de conexiones
- Reduce carga en PostgreSQL

---

## Checklist de Implementación

- [x] Rate limiter eliminado de Express
- [x] Pool de conexiones aumentado a 50
- [ ] Verificar `max_connections` en PostgreSQL (debe ser >= 100)
- [ ] Reiniciar PostgreSQL después de cambios
- [ ] Reiniciar servidor Node.js
- [ ] Probar con múltiples usuarios simultáneos
- [ ] Monitorear uso de conexiones con la query de arriba

---

## ¿Qué hacer si hay problemas?

### Error: "sorry, too many clients already"
- PostgreSQL alcanzó su límite de conexiones
- Aumenta `max_connections` en `postgresql.conf`
- Verifica que no haya conexiones huérfanas

### Rendimiento lento con muchos usuarios
1. Verifica índices de base de datos
2. Aumenta `shared_buffers` en PostgreSQL
3. Considera usar PgBouncer

### Memoria insuficiente
- Reduce `max_connections` a 50
- Reduce `work_mem` en PostgreSQL
- Considera aumentar RAM del servidor

---

## Contacto y Soporte

Si encuentras problemas de rendimiento, monitorea:
1. Uso de CPU del servidor
2. Uso de memoria RAM
3. Conexiones activas en PostgreSQL
4. Tiempo de respuesta de queries

Logs útiles:
- Node.js: `console` output
- PostgreSQL: `postgresql.log` (en carpeta `data/log/`)
