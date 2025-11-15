# 📚 Guía Completa de Base de Datos - DocuPrex

**Sistema de Firmas Digitales**
**PostgreSQL 14+**
**Versión del Schema: 2025-01-13**

---

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura de la Base de Datos](#arquitectura-de-la-base-de-datos)
3. [Estructura Completa](#estructura-completa)
4. [Cómo Recrear la Base de Datos](#cómo-recrear-la-base-de-datos)
5. [Migraciones Aplicadas](#migraciones-aplicadas)
6. [Diagrama de Relaciones](#diagrama-de-relaciones)
7. [Queries de Ejemplo](#queries-de-ejemplo)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Resumen Ejecutivo

### ¿Qué contiene esta base de datos?

DocuPrex es un sistema de firmas digitales que gestiona documentos, usuarios, flujos de firma y notificaciones.

**8 Tablas Principales:**
- `users` - Usuarios del sistema (AD sync)
- `documents` - Documentos para firmar
- `signatures` - Firmas digitales realizadas
- `document_signers` - Asignación de firmantes
- `document_types` - Tipos de documentos (SA, FV, etc.)
- `document_type_roles` - Roles por tipo de documento
- `notifications` - Notificaciones in-app
- `audit_log` - Auditoría completa

**Características:**
- ✅ UUIDs como primary keys
- ✅ Timestamps automáticos (created_at, updated_at)
- ✅ Foreign keys con ON DELETE CASCADE
- ✅ Índices optimizados para queries frecuentes
- ✅ 3 Vistas para queries complejas
- ✅ Triggers para updates automáticos
- ✅ Datos iniciales (Tipo documento "SA" con 6 roles)

---

## 🏗️ Arquitectura de la Base de Datos

### Diagrama de Alto Nivel

```
┌─────────────────────────────────────────────────────────────┐
│                    USUARIOS Y AUTENTICACIÓN                  │
├─────────────────────────────────────────────────────────────┤
│  users                                                       │
│  ├─ Autenticación via Active Directory                      │
│  ├─ Roles: admin, user, viewer                              │
│  └─ email_notifications: preferencia de emails              │
└─────────────────────────────────────────────────────────────┘
                            │
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  documents   │    │notifications │    │  audit_log   │
│              │    │              │    │              │
│ - title      │    │ - type       │    │ - action     │
│ - file_path  │    │ - is_read    │    │ - entity     │
│ - status     │    │ - document   │    │ - details    │
│ - type       │◄───┤              │    │              │
└──────┬───────┘    └──────────────┘    └──────────────┘
       │
       ├──────────────┐
       ▼              ▼
┌──────────────┐  ┌──────────────┐
│ signatures   │  │doc_signers   │
│              │  │              │
│ - status     │  │ - order      │
│ - signed_at  │  │ - role_name  │
│ - rejection  │  │ - notified   │
│ - consecutivo│  │              │
└──────────────┘  └──────────────┘
       ▲              ▲
       │              │
       └──────┬───────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌──────────────┐  ┌──────────────────┐
│document_types│  │document_type_roles│
│              │  │                   │
│ - name: SA   │  │ - Solicitante     │
│ - code: SA   │  │ - Aprobador       │
│ - prefix     │  │ - Negociaciones   │
└──────────────┘  │ - Área Financiera │
                  │ - Gerencia Ejec.  │
                  │ - Tesorería       │
                  └───────────────────┘
```

---

## 📊 Estructura Completa

### TABLA 1: users

**Descripción:** Usuarios del sistema sincronizados desde Active Directory

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    ad_username VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Índices:**
- `idx_users_email` - Para login rápido
- `idx_users_ad_username` - Para sync de AD
- `idx_users_role` - Para filtrar por rol

**Datos de Ejemplo:**
```sql
-- Usuario se crea automáticamente al sincronizar con AD
-- o al registrarse localmente
```

---

### TABLA 2: document_types

**Descripción:** Define tipos de documentos disponibles (SA, FV, etc.)

```sql
CREATE TABLE document_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    prefix VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Índices:**
- `idx_document_types_code` - Para búsqueda por código
- `idx_document_types_is_active` - Para filtrar activos

**Datos Iniciales:**
```sql
-- Solicitud de Anticipo (SA)
INSERT INTO document_types (name, code, prefix, description)
VALUES (
    'Solicitud de Anticipo',
    'SA',
    'SA -',
    'Solicitud de anticipo de fondos con flujo de aprobación por áreas'
);
```

---

### TABLA 3: document_type_roles

**Descripción:** Roles específicos para cada tipo de documento

```sql
CREATE TABLE document_type_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE CASCADE,
    role_name VARCHAR(255) NOT NULL,
    role_code VARCHAR(50) NOT NULL,
    order_position INTEGER NOT NULL,
    is_required BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_type_id, role_code)
);
```

**Índices:**
- `idx_document_type_roles_document_type` - Para listar roles por tipo
- `idx_document_type_roles_order` - Para ordenar roles

**Datos Iniciales (Tipo SA):**
```sql
-- 6 roles para Solicitud de Anticipo
1. Solicitante (obligatorio)
2. Aprobador (obligatorio)
3. Negociaciones (obligatorio)
4. Área Financiera (obligatorio)
5. Gerencia Ejecutiva (opcional)
6. Tesorería (obligatorio)
```

---

### TABLA 4: documents

**Descripción:** Documentos subidos al sistema para firma

```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    file_name VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    status VARCHAR(50) DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'archived')),
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type_id UUID REFERENCES document_types(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

**Índices:**
- `idx_documents_uploaded_by` - Documentos por usuario
- `idx_documents_status` - Filtrar por estado
- `idx_documents_created_at` - Ordenar por fecha
- `idx_documents_document_type` - Filtrar por tipo

**Estados Posibles:**
- `pending` - Recién subido, esperando asignación de firmantes
- `in_progress` - Tiene firmantes asignados, en proceso de firma
- `completed` - Todas las firmas completadas
- `rejected` - Rechazado por algún firmante
- `archived` - Archivado (ya no visible)

---

### TABLA 5: document_signers

**Descripción:** Asignación de usuarios que deben firmar cada documento

```sql
CREATE TABLE document_signers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_position INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT true,
    assigned_role_id UUID REFERENCES document_type_roles(id) ON DELETE SET NULL,
    role_name VARCHAR(255),
    notified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, user_id)
);
```

**Índices:**
- `idx_document_signers_document_id` - Firmantes por documento
- `idx_document_signers_user_id` - Documentos por firmante
- `idx_document_signers_role` - Por rol asignado

**Ejemplo:**
```sql
-- Documento SA con 5 firmantes
-- Juan (Solicitante) -> María (Aprobador) -> Pedro (Negociaciones)
-- -> Ana (Área Financiera) -> Luis (Tesorería)
```

---

### TABLA 6: signatures

**Descripción:** Firmas digitales realizadas en los documentos

```sql
CREATE TABLE signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    signer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signature_data TEXT,
    signature_type VARCHAR(50) DEFAULT 'digital'
        CHECK (signature_type IN ('digital', 'electronic', 'handwritten')),
    ip_address VARCHAR(45),
    user_agent TEXT,
    status VARCHAR(50) DEFAULT 'pending'
        CHECK (status IN ('pending', 'signed', 'rejected')),
    rejection_reason TEXT,
    signed_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    consecutivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, signer_id)
);
```

**Índices:**
- `idx_signatures_document_id` - Firmas por documento
- `idx_signatures_signer_id` - Firmas por usuario
- `idx_signatures_status` - Filtrar por estado

**Estados:**
- `pending` - Esperando firma
- `signed` - Firmado exitosamente
- `rejected` - Rechazado con razón

**Campos Especiales:**
- `consecutivo` - Usado para Legalización de Facturas (FV)
- `rejection_reason` - Texto explicando por qué se rechazó
- `rejected_at` - Timestamp del rechazo

---

### TABLA 7: notifications

**Descripción:** Notificaciones in-app para usuarios

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    document_title VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Índices:**
- `idx_notifications_user_id` - Notificaciones por usuario
- `idx_notifications_document_id` - Notificaciones por documento
- `idx_notifications_is_read` - Filtrar leídas/no leídas
- `idx_notifications_created_at` - Ordenar por fecha

**Tipos de Notificación:**
- `signature_request` - Te asignaron para firmar
- `document_signed` - Alguien firmó tu documento
- `document_completed` - Documento completamente firmado
- `document_rejected` - Documento rechazado

---

### TABLA 8: audit_log

**Descripción:** Registro completo de auditoría del sistema

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Índices:**
- `idx_audit_log_user_id` - Acciones por usuario
- `idx_audit_log_entity` - Acciones por entidad
- `idx_audit_log_created_at` - Ordenar por fecha

**Acciones Comunes:**
- `upload` - Subir documento
- `sign` - Firmar documento
- `reject` - Rechazar documento
- `download` - Descargar documento
- `delete` - Eliminar documento
- `assign_signers` - Asignar firmantes

---

## 🔄 FUNCIONES Y TRIGGERS

### Función: update_updated_at_column

Actualiza automáticamente el campo `updated_at` en cualquier UPDATE

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Triggers Activos

```sql
-- Se ejecutan automáticamente en UPDATE
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signatures_updated_at
    BEFORE UPDATE ON signatures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_types_updated_at
    BEFORE UPDATE ON document_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 👁️ VISTAS

### Vista 1: v_documents_with_signatures

Documentos con conteo de firmas

```sql
CREATE OR REPLACE VIEW v_documents_with_signatures AS
SELECT
    d.*,
    u.name as uploaded_by_name,
    u.email as uploaded_by_email,
    COUNT(DISTINCT ds.user_id) as total_signers,
    COUNT(DISTINCT CASE WHEN s.status = 'signed' THEN s.signer_id END) as signed_count,
    COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.signer_id END) as pending_count
FROM documents d
LEFT JOIN users u ON d.uploaded_by = u.id
LEFT JOIN document_signers ds ON d.id = ds.document_id
LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
GROUP BY d.id, u.name, u.email;
```

**Uso:**
```sql
-- Ver todos los documentos con su progreso de firmas
SELECT * FROM v_documents_with_signatures WHERE status = 'in_progress';
```

---

### Vista 2: v_pending_documents_by_user

Documentos pendientes por usuario

```sql
CREATE OR REPLACE VIEW v_pending_documents_by_user AS
SELECT
    ds.user_id,
    d.id as document_id,
    d.title,
    d.description,
    d.status as document_status,
    d.created_at,
    u.name as uploaded_by_name,
    COALESCE(s.status, 'pending') as signature_status
FROM document_signers ds
JOIN documents d ON ds.document_id = d.id
JOIN users u ON d.uploaded_by = u.id
LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
WHERE COALESCE(s.status, 'pending') = 'pending'
    AND d.status NOT IN ('completed', 'archived');
```

**Uso:**
```sql
-- Ver documentos pendientes de un usuario específico
SELECT * FROM v_pending_documents_by_user
WHERE user_id = 'uuid-del-usuario';
```

---

### Vista 3: v_documents_with_details

Documentos con detalles completos (incluyendo tipo)

```sql
CREATE OR REPLACE VIEW v_documents_with_details AS
SELECT
    d.*,
    u.name as uploaded_by_name,
    u.email as uploaded_by_email,
    dt.name as document_type_name,
    dt.code as document_type_code,
    dt.prefix as document_type_prefix,
    COUNT(DISTINCT ds.user_id) as total_signers,
    COUNT(DISTINCT CASE WHEN s.status = 'signed' THEN s.signer_id END) as signed_count,
    COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.signer_id END) as pending_count
FROM documents d
LEFT JOIN users u ON d.uploaded_by = u.id
LEFT JOIN document_types dt ON d.document_type_id = dt.id
LEFT JOIN document_signers ds ON d.id = ds.document_id
LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
GROUP BY d.id, u.name, u.email, dt.name, dt.code, dt.prefix;
```

---

## 🔧 Cómo Recrear la Base de Datos

### Método 1: Docker (Recomendado)

#### Paso 1: Limpiar directorio bd/

```bash
# Detener contenedores
docker-compose down

# Limpiar directorio bd/ (ELIMINA TODOS LOS DATOS)
rm -rf bd/*

# Reiniciar contenedores
docker-compose up -d
```

#### Paso 2: Verificar que PostgreSQL inició correctamente

```bash
docker-compose logs postgres-db
```

Deberías ver:
```
database system is ready to accept connections
```

#### Paso 3: Aplicar el schema

```bash
# Conectar a PostgreSQL
docker exec -it <container-id> psql -U postgres -d firmas_db

# Ejecutar schema
\i /docker-entrypoint-initdb.d/schema.sql
```

O directamente:

```bash
docker exec -i <container-id> psql -U postgres -d firmas_db < server/database/schema.sql
```

---

### Método 2: Manual (PostgreSQL Local)

#### Paso 1: Crear Base de Datos

```bash
createdb firmas_db
```

#### Paso 2: Aplicar Schema

```bash
psql -U postgres -d firmas_db -f server/database/schema.sql
```

#### Paso 3: Aplicar Migraciones (opcional)

```bash
psql -U postgres -d firmas_db -f server/database/migrations/001_add_document_types_and_roles.sql
psql -U postgres -d firmas_db -f server/database/migrations/001_add_email_notifications.sql
psql -U postgres -d firmas_db -f server/database/migrations/003_add_consecutivo_field.sql
```

---

### Método 3: Usando Claude Code en VS Code

1. Abre VS Code en el proyecto DocuPrex
2. Abre Claude Code
3. Pega este prompt:

```
Lee el archivo bd/DATABASE_COMPLETE_GUIDE.md y recrea la base de datos
PostgreSQL ejecutando el schema completo desde server/database/schema.sql
en el contenedor Docker postgres-db.

Luego verifica que todas las tablas, vistas y funciones se crearon correctamente.
```

---

## 📝 Migraciones Aplicadas

### Migración 001: Document Types and Roles
**Archivo:** `001_add_document_types_and_roles.sql`
**Fecha:** 2025-01-11
**Descripción:**
- Crea tablas `document_types` y `document_type_roles`
- Agrega columnas `document_type_id` a `documents`
- Agrega columnas `assigned_role_id` y `role_name` a `document_signers`
- Inserta tipo "Solicitud de Anticipo" (SA) con 6 roles

**Cambios:**
```sql
-- Nuevas tablas
CREATE TABLE document_types (...);
CREATE TABLE document_type_roles (...);

-- Modificaciones
ALTER TABLE documents ADD COLUMN document_type_id UUID;
ALTER TABLE document_signers ADD COLUMN assigned_role_id UUID;
ALTER TABLE document_signers ADD COLUMN role_name VARCHAR(255);
```

---

### Migración 002: Email Notifications
**Archivo:** `001_add_email_notifications.sql`
**Fecha:** 2025-01-11
**Descripción:**
- Agrega columna `email_notifications` a tabla `users`
- Permite a usuarios habilitar/deshabilitar emails

**Cambios:**
```sql
ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE;
```

---

### Migración 003: Consecutivo Field
**Archivo:** `003_add_consecutivo_field.sql`
**Fecha:** 2025-01-13
**Descripción:**
- Agrega campo `consecutivo` a tabla `signatures`
- Usado para Legalización de Facturas (FV)

**Cambios:**
```sql
ALTER TABLE signatures ADD COLUMN consecutivo TEXT;
```

---

## 📐 Diagrama de Relaciones (ERD)

### Relaciones Principales

```
users (1) ──── (N) documents [uploaded_by]
users (1) ──── (N) document_signers [user_id]
users (1) ──── (N) signatures [signer_id]
users (1) ──── (N) notifications [user_id]
users (1) ──── (N) audit_log [user_id]

documents (1) ──── (N) document_signers [document_id]
documents (1) ──── (N) signatures [document_id]
documents (1) ──── (N) notifications [document_id]
documents (N) ──── (1) document_types [document_type_id]

document_types (1) ──── (N) document_type_roles [document_type_id]
document_type_roles (1) ──── (N) document_signers [assigned_role_id]
```

### Cascadas ON DELETE

**CASCADE** (elimina registros relacionados):
- `users` → `documents`, `document_signers`, `signatures`, `notifications`
- `documents` → `document_signers`, `signatures`, `notifications`
- `document_types` → `document_type_roles`

**SET NULL** (setea NULL en vez de eliminar):
- `documents.document_type_id`
- `document_signers.assigned_role_id`
- `audit_log.user_id`

---

## 💡 Queries de Ejemplo

### Query 1: Documentos pendientes de un usuario

```sql
SELECT
    d.id,
    d.title,
    d.created_at,
    u.name as uploader,
    ds.role_name as my_role
FROM documents d
JOIN document_signers ds ON d.id = ds.document_id
JOIN users u ON d.uploaded_by = u.id
LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
WHERE ds.user_id = 'uuid-del-usuario'
    AND COALESCE(s.status, 'pending') = 'pending'
    AND d.status NOT IN ('completed', 'archived')
ORDER BY d.created_at DESC;
```

---

### Query 2: Progreso de firma de un documento

```sql
SELECT
    ds.order_position,
    ds.role_name,
    u.name as signer_name,
    u.email as signer_email,
    COALESCE(s.status, 'pending') as signature_status,
    s.signed_at,
    s.rejection_reason
FROM document_signers ds
JOIN users u ON ds.user_id = u.id
LEFT JOIN signatures s ON ds.document_id = s.document_id AND ds.user_id = s.signer_id
WHERE ds.document_id = 'uuid-del-documento'
ORDER BY ds.order_position;
```

---

### Query 3: Estadísticas de documentos por usuario

```sql
SELECT
    u.name,
    u.email,
    COUNT(*) as total_documents,
    COUNT(CASE WHEN d.status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN d.status = 'in_progress' THEN 1 END) as in_progress,
    COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected
FROM users u
LEFT JOIN documents d ON u.id = d.uploaded_by
WHERE u.is_active = true
GROUP BY u.id, u.name, u.email
ORDER BY total_documents DESC;
```

---

### Query 4: Notificaciones no leídas

```sql
SELECT
    n.id,
    n.type,
    n.document_title,
    n.created_at,
    actor.name as actor_name
FROM notifications n
LEFT JOIN users actor ON n.actor_id = actor.id
WHERE n.user_id = 'uuid-del-usuario'
    AND n.is_read = false
ORDER BY n.created_at DESC;
```

---

### Query 5: Auditoría de un documento

```sql
SELECT
    al.action,
    al.created_at,
    u.name as user_name,
    al.ip_address,
    al.details
FROM audit_log al
LEFT JOIN users u ON al.user_id = u.id
WHERE al.entity_type = 'document'
    AND al.entity_id = 'uuid-del-documento'
ORDER BY al.created_at ASC;
```

---

## 🚨 Troubleshooting

### Error: "directory exists but is not empty"

**Causa:** PostgreSQL detecta archivos en bd/ de una instalación anterior

**Solución:**
```bash
docker-compose down
rm -rf bd/*
docker-compose up -d
```

---

### Error: "relation does not exist"

**Causa:** Schema no aplicado o tablas no creadas

**Solución:**
```bash
docker exec -i <container-id> psql -U postgres -d firmas_db < server/database/schema.sql
```

---

### Error: "No autenticado" en GraphQL

**Causa:** Usuario no logueado o token expirado

**Solución:**
- Hacer login en la aplicación
- Verificar que el token JWT esté en localStorage
- Verificar que el header Authorization esté presente

---

### Verificar que PostgreSQL está corriendo

```bash
docker-compose ps
docker-compose logs postgres-db
```

---

### Conectar a PostgreSQL manualmente

```bash
docker exec -it <container-id> psql -U postgres -d firmas_db
```

Dentro de psql:
```sql
\dt              -- Listar tablas
\d+ users        -- Describir tabla users
\dv              -- Listar vistas
\df              -- Listar funciones
SELECT version(); -- Ver versión de PostgreSQL
```

---

## 📊 Información del Schema

**Versión:** 2025-01-13
**PostgreSQL:** 14+
**Extensiones:** uuid-ossp
**Encoding:** UTF8
**Locale:** en_US.utf8

**Archivos Clave:**
- `/server/database/schema.sql` - Schema completo (ejecutar este)
- `/server/database/DATABASE_COMPLETE_SCHEMA.sql` - Copia idéntica
- `/server/database/migrations/` - Migraciones incrementales
- `/bd/DATABASE_COMPLETE_GUIDE.md` - Esta guía

---

## ✅ Checklist de Validación

Después de recrear la BD, verifica:

```sql
-- ✅ 8 tablas creadas
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Resultado esperado: 8

-- ✅ 3 vistas creadas
SELECT COUNT(*) FROM information_schema.views
WHERE table_schema = 'public';
-- Resultado esperado: 3

-- ✅ Extensión uuid-ossp instalada
SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';

-- ✅ Tipo de documento SA creado
SELECT * FROM document_types WHERE code = 'SA';

-- ✅ 6 roles para SA creados
SELECT COUNT(*) FROM document_type_roles dtr
JOIN document_types dt ON dtr.document_type_id = dt.id
WHERE dt.code = 'SA';
-- Resultado esperado: 6

-- ✅ Triggers activos
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';
-- Resultado esperado: 5 triggers
```

---

## 🎓 Datos de Ejemplo para Testing

```sql
-- Crear usuario de prueba
INSERT INTO users (name, email, role, ad_username)
VALUES ('Juan Pérez', 'juan@example.com', 'admin', 'juan.perez')
RETURNING id;

-- Crear documento de prueba
INSERT INTO documents (title, file_name, file_path, file_size, uploaded_by, document_type_id)
VALUES (
    'SA - Prueba 001',
    'prueba.pdf',
    '/uploads/juan_perez/prueba.pdf',
    1024000,
    'uuid-de-juan',
    (SELECT id FROM document_types WHERE code = 'SA')
)
RETURNING id;

-- Asignar firmantes
INSERT INTO document_signers (document_id, user_id, order_position, assigned_role_id, role_name)
VALUES (
    'uuid-del-documento',
    'uuid-del-usuario',
    1,
    (SELECT id FROM document_type_roles WHERE role_code = 'SOLICITANTE'),
    'Solicitante'
);
```

---

## 📞 Soporte

Si tienes problemas recreando la base de datos:

1. Revisa los logs de PostgreSQL: `docker-compose logs postgres-db`
2. Verifica que el directorio bd/ esté vacío antes de iniciar
3. Asegúrate de usar PostgreSQL 14 o superior
4. Ejecuta el schema completo desde `server/database/schema.sql`

---

**Última actualización:** 2025-01-15
**Autor:** Claude Code - Fase 5 Refactorización Avanzada
**Proyecto:** DocuPrex - Sistema de Firmas Digitales
