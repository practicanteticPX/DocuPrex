# 📚 Documentación de Base de Datos - DocuPrex

## 📁 Archivos en esta Carpeta

### 🎯 **Archivos Principales** (USAR ESTOS)

| Archivo | Propósito | Cuándo Usar |
|---------|-----------|-------------|
| **DATABASE_COMPLETE_SCHEMA.sql** | Schema SQL completo con TODA la estructura | ✅ Al migrar a un nuevo servidor<br>✅ Para recrear la BD desde cero<br>✅ Cuando la BD está corrupta |
| **DATABASE_STRUCTURE.md** | Documentación técnica completa | 📖 Para entender la estructura<br>📖 Para consultar columnas y relaciones<br>📖 Como referencia |

### 📜 Archivos Históricos (NO USAR directamente)

| Archivo | Descripción |
|---------|-------------|
| `schema.sql` | Schema original (incompleto, le faltan migraciones) |
| `init.js` | Script de inicialización (ejecuta schema.sql) |
| `db.js` | Configuración de conexión a PostgreSQL |
| `migrations/` | Migraciones aplicadas históricamente |

---

## 🚀 Cómo Usar el Schema Completo

### Opción 1: Recrear BD desde Cero (Recomendado)

```bash
# 1. Detener contenedores
docker-compose down

# 2. Eliminar datos corruptos
rmdir /s bd
mkdir bd

# 3. Iniciar PostgreSQL
docker-compose up -d postgres-db

# 4. Esperar 10 segundos
timeout 10

# 5. Ejecutar schema completo
docker-compose exec -T postgres-db psql -U postgres -d firmas_db < server\database\DATABASE_COMPLETE_SCHEMA.sql

# 6. Verificar
docker-compose exec postgres-db psql -U postgres -d firmas_db -c "\dt"
```

### Opción 2: Actualizar BD Existente (Con Datos)

```bash
# ADVERTENCIA: Esto intentará actualizar sin perder datos
# Puede fallar si hay conflictos

# 1. Hacer backup primero
docker-compose exec postgres-db pg_dump -U postgres firmas_db > backup.sql

# 2. Ejecutar schema (usará IF NOT EXISTS)
docker-compose exec -T postgres-db psql -U postgres -d firmas_db < server\database\DATABASE_COMPLETE_SCHEMA.sql
```

---

## 📊 Qué Incluye el Schema Completo

✅ **8 Tablas**:
1. `users` - Usuarios del sistema
2. `document_types` - Tipos de documentos (SA, etc)
3. `document_type_roles` - Roles por tipo de documento
4. `documents` - Documentos subidos
5. `document_signers` - Firmantes asignados
6. `signatures` - Firmas digitales
7. `notifications` - Notificaciones
8. `audit_log` - Auditoría

✅ **Relaciones**:
- Todas las Foreign Keys con `ON DELETE CASCADE` o `SET NULL`
- Restricciones UNIQUE para prevenir duplicados

✅ **Índices**:
- 20+ índices para optimizar consultas

✅ **Funciones y Triggers**:
- `update_updated_at_column()` - Actualiza `updated_at` automáticamente
- 5 triggers en diferentes tablas

✅ **Vistas**:
- `v_documents_with_signatures`
- `v_pending_documents_by_user`
- `v_documents_with_details`

✅ **Datos Iniciales**:
- Tipo de documento: "Solicitud de Anticipo" (código: SA)
- 6 roles para SA: Solicitante, Aprobador, Negociaciones, Área Financiera, Gerencia Ejecutiva, Tesorería

---

## ✅ Verificar que Todo Funciona

```bash
# Conectarse a la BD
docker-compose exec postgres-db psql -U postgres -d firmas_db

# Verificar tablas (debería mostrar 8)
\dt

# Verificar tipo de documento SA
SELECT * FROM document_types WHERE code = 'SA';

# Verificar roles de SA (debería mostrar 6)
SELECT role_name, order_position FROM document_type_roles dtr
JOIN document_types dt ON dtr.document_type_id = dt.id
WHERE dt.code = 'SA'
ORDER BY order_position;

# Verificar vistas (debería mostrar 3)
\dv

# Salir
\q
```

**Resultado Esperado**:
```
Tablas: 8 (users, document_types, document_type_roles, documents, document_signers, signatures, notifications, audit_log)
Vistas: 3 (v_documents_with_signatures, v_pending_documents_by_user, v_documents_with_details)
Tipo SA: 1 registro
Roles SA: 6 registros (Solicitante, Aprobador, Negociaciones, Área Financiera, Gerencia Ejecutiva, Tesorería)
```

---

## 🔄 Migración entre Servidores

Para migrar a un nuevo servidor, sigue la guía completa en:
📖 **[MIGRATION_GUIDE.md](../../MIGRATION_GUIDE.md)**

**Resumen rápido**:
1. Hacer backup de datos y archivos
2. Actualizar IPs en configuración
3. Recrear BD con `DATABASE_COMPLETE_SCHEMA.sql`
4. Restaurar archivos de documentos
5. Iniciar aplicación

---

## 📖 Consultar Estructura de la BD

Para ver la documentación completa de todas las tablas, columnas y relaciones:
📖 **[DATABASE_STRUCTURE.md](DATABASE_STRUCTURE.md)**

---

## 🆘 Problemas Comunes

### "La BD no tiene datos iniciales"

**Solución**: Ejecutar `DATABASE_COMPLETE_SCHEMA.sql` - ya incluye el tipo SA y sus roles

### "Error: relation already exists"

**Causa**: Intentando crear tablas que ya existen
**Solución**: El schema usa `CREATE TABLE IF NOT EXISTS`, así que esto no debería pasar. Si ocurre, es seguro ignorarlo.

### "Error: could not open file base/16384/XXXXX"

**Causa**: Corrupción de base de datos (común con bind mount en Windows)
**Solución**: Recrear BD desde cero siguiendo "Opción 1" arriba

### "Falta la tabla document_types o document_type_roles"

**Causa**: Se ejecutó `schema.sql` en lugar de `DATABASE_COMPLETE_SCHEMA.sql`
**Solución**: Ejecutar `DATABASE_COMPLETE_SCHEMA.sql` - ya incluye estas tablas

---

## 🔧 Migraciones Históricas

Las migraciones en `migrations/` son históricas y **YA ESTÁN INCLUIDAS** en `DATABASE_COMPLETE_SCHEMA.sql`:

- ✅ `001_add_document_types_and_roles.sql` → Incluido
- ✅ `001_add_email_notifications.sql` → Incluido
- ✅ `add_rejection_reason.sql` → Incluido
- ✅ `add_rejected_at.sql` → Incluido
- ✅ `create_notifications_table.sql` → Incluido

**No necesitas ejecutar estas migraciones manualmente** si usas `DATABASE_COMPLETE_SCHEMA.sql`.

---

## 📝 Notas Importantes

1. **NO ejecutar `schema.sql` directamente** - usa `DATABASE_COMPLETE_SCHEMA.sql`
2. **NO crear usuario admin** - la app usa solo Active Directory
3. **Siempre hacer backup** antes de ejecutar cambios en BD
4. **Usar Docker Volume** en lugar de bind mount para evitar corrupción

---

**Última actualización**: 2025-11-11
