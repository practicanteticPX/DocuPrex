# 📊 Estructura Completa de la Base de Datos - DocuPrex

## Resumen General

- **Base de Datos**: PostgreSQL 14+
- **Total de Tablas**: 8
- **Total de Vistas**: 3
- **Extensiones**: uuid-ossp
- **Funciones**: 1 (update_updated_at_column)
- **Triggers**: 5 (actualización automática de updated_at)

---

## 🗂️ Diagrama de Relaciones

```
users (👤)
  ↓ uploaded_by
documents (📄)
  ↓ document_id                    ↓ document_type_id
signatures (✍️)                   document_types (📋)
  ↓ signer_id                       ↓ document_type_id
users (👤)                        document_type_roles (🎭)

documents (📄)
  ↓ document_id
document_signers (👥)
  ↓ user_id + assigned_role_id
users (👤) + document_type_roles (🎭)

users (👤)
  ↓ user_id
notifications (🔔)
  ↓ document_id + actor_id
documents (📄) + users (👤)

users (👤)
  ↓ user_id
audit_log (📝)
```

---

## 📋 Tabla 1: `users`

**Propósito**: Almacenar información de usuarios del sistema (sincronizados desde Active Directory)

### Columnas

| Columna | Tipo | Restricciones | Descripción |
|---------|------|--------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Identificador único del usuario |
| `name` | VARCHAR(255) | NOT NULL | Nombre completo del usuario |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Email único del usuario |
| `password_hash` | VARCHAR(255) | NULL | Hash de contraseña (solo para usuarios locales) |
| `role` | VARCHAR(50) | DEFAULT 'user', CHECK | Rol del usuario: 'admin', 'user', 'viewer' |
| `ad_username` | VARCHAR(255) | NULL | Nombre de usuario en Active Directory |
| `is_active` | BOOLEAN | DEFAULT true | Si el usuario está activo |
| `email_notifications` | BOOLEAN | DEFAULT true | Si el usuario recibe notificaciones por email |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de creación |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de última actualización |

### Índices
- `idx_users_email` en `email`
- `idx_users_ad_username` en `ad_username`
- `idx_users_role` en `role`

### Relaciones
- **Es referenciado por**: `documents.uploaded_by`, `signatures.signer_id`, `document_signers.user_id`, `notifications.user_id`, `notifications.actor_id`, `audit_log.user_id`

---

## 📋 Tabla 2: `document_types`

**Propósito**: Definir los tipos de documentos disponibles en el sistema (ej: "Solicitud de Anticipo")

### Columnas

| Columna | Tipo | Restricciones | Descripción |
|---------|------|--------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Identificador único del tipo |
| `name` | VARCHAR(255) | UNIQUE, NOT NULL | Nombre del tipo (ej: "Solicitud de Anticipo") |
| `code` | VARCHAR(50) | UNIQUE, NOT NULL | Código interno (ej: "SA") |
| `description` | TEXT | NULL | Descripción del tipo de documento |
| `prefix` | VARCHAR(50) | NOT NULL | Prefijo mostrado en títulos (ej: "SA -") |
| `is_active` | BOOLEAN | DEFAULT true | Si el tipo está activo |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de creación |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de última actualización |

### Índices
- `idx_document_types_code` en `code`
- `idx_document_types_is_active` en `is_active`

### Relaciones
- **Es referenciado por**: `documents.document_type_id`, `document_type_roles.document_type_id`

### Datos Iniciales
- **SA**: Solicitud de Anticipo (código: SA, prefijo: "SA -")

---

## 📋 Tabla 3: `document_type_roles`

**Propósito**: Definir los roles específicos para cada tipo de documento

### Columnas

| Columna | Tipo | Restricciones | Descripción |
|---------|------|--------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Identificador único del rol |
| `document_type_id` | UUID | NOT NULL, FK → document_types(id) CASCADE | Tipo de documento al que pertenece |
| `role_name` | VARCHAR(255) | NOT NULL | Nombre del rol (ej: "Solicitante") |
| `role_code` | VARCHAR(50) | NOT NULL | Código del rol (ej: "SOLICITANTE") |
| `order_position` | INTEGER | NOT NULL | Orden de firma (1, 2, 3...) |
| `is_required` | BOOLEAN | DEFAULT true | Si el rol es obligatorio |
| `description` | TEXT | NULL | Descripción del rol |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de creación |

### Restricciones Únicas
- `UNIQUE(document_type_id, role_code)` - Un tipo no puede tener roles duplicados

### Índices
- `idx_document_type_roles_document_type` en `document_type_id`
- `idx_document_type_roles_order` en `(document_type_id, order_position)`

### Relaciones
- **Referencia a**: `document_types.id` (ON DELETE CASCADE)
- **Es referenciado por**: `document_signers.assigned_role_id`

### Datos Iniciales para Tipo "SA"
1. **Solicitante** (SOLICITANTE) - Orden 1 - Obligatorio
2. **Aprobador** (APROBADOR) - Orden 2 - Obligatorio
3. **Negociaciones** (NEGOCIACIONES) - Orden 3 - Obligatorio
4. **Área Financiera** (AREA_FINANCIERA) - Orden 4 - Obligatorio
5. **Gerencia Ejecutiva** (GERENCIA_EJECUTIVA) - Orden 5 - Opcional

---

## 📋 Tabla 4: `documents`

**Propósito**: Almacenar documentos subidos al sistema para firmas

### Columnas

| Columna | Tipo | Restricciones | Descripción |
|---------|------|--------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Identificador único del documento |
| `title` | VARCHAR(500) | NOT NULL | Título del documento |
| `description` | TEXT | NULL | Descripción del documento |
| `file_name` | VARCHAR(500) | NOT NULL | Nombre del archivo original |
| `file_path` | VARCHAR(1000) | NOT NULL | Ruta del archivo en el servidor |
| `file_size` | INTEGER | NOT NULL | Tamaño del archivo en bytes |
| `mime_type` | VARCHAR(100) | DEFAULT 'application/pdf' | Tipo MIME del archivo |
| `status` | VARCHAR(50) | DEFAULT 'pending', CHECK | Estado: 'pending', 'in_progress', 'completed', 'rejected', 'archived' |
| `uploaded_by` | UUID | NOT NULL, FK → users(id) CASCADE | Usuario que subió el documento |
| `document_type_id` | UUID | FK → document_types(id) SET NULL | Tipo de documento (SA, etc) |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de creación |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de última actualización |
| `completed_at` | TIMESTAMP WITH TIME ZONE | NULL | Fecha de completado (todas firmas) |

### Índices
- `idx_documents_uploaded_by` en `uploaded_by`
- `idx_documents_status` en `status`
- `idx_documents_created_at` en `created_at DESC`
- `idx_documents_document_type` en `document_type_id`

### Relaciones
- **Referencia a**: `users.id` (ON DELETE CASCADE), `document_types.id` (ON DELETE SET NULL)
- **Es referenciado por**: `signatures.document_id`, `document_signers.document_id`, `notifications.document_id`

---

## 📋 Tabla 5: `document_signers`

**Propósito**: Gestionar quiénes deben firmar cada documento (tabla intermedia)

### Columnas

| Columna | Tipo | Restricciones | Descripción |
|---------|------|--------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Identificador único |
| `document_id` | UUID | NOT NULL, FK → documents(id) CASCADE | Documento a firmar |
| `user_id` | UUID | NOT NULL, FK → users(id) CASCADE | Usuario asignado como firmante |
| `order_position` | INTEGER | DEFAULT 0 | Orden de firma (0 = sin orden) |
| `is_required` | BOOLEAN | DEFAULT true | Si la firma es obligatoria |
| `assigned_role_id` | UUID | FK → document_type_roles(id) SET NULL | Rol asignado al firmante |
| `role_name` | VARCHAR(255) | NULL | Nombre del rol (copia histórica) |
| `notified_at` | TIMESTAMP WITH TIME ZONE | NULL | Cuándo se notificó al firmante |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de asignación |

### Restricciones Únicas
- `UNIQUE(document_id, user_id)` - Un usuario solo puede firmar un documento una vez

### Índices
- `idx_document_signers_document_id` en `document_id`
- `idx_document_signers_user_id` en `user_id`
- `idx_document_signers_role` en `assigned_role_id`

### Relaciones
- **Referencia a**: `documents.id` (ON DELETE CASCADE), `users.id` (ON DELETE CASCADE), `document_type_roles.id` (ON DELETE SET NULL)

---

## 📋 Tabla 6: `signatures`

**Propósito**: Almacenar las firmas digitales realizadas en los documentos

### Columnas

| Columna | Tipo | Restricciones | Descripción |
|---------|------|--------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Identificador único de la firma |
| `document_id` | UUID | NOT NULL, FK → documents(id) CASCADE | Documento firmado |
| `signer_id` | UUID | NOT NULL, FK → users(id) CASCADE | Usuario que firmó |
| `signature_data` | TEXT | NULL | Datos de la firma digital (base64, hash) |
| `signature_type` | VARCHAR(50) | DEFAULT 'digital', CHECK | Tipo: 'digital', 'electronic', 'handwritten' |
| `ip_address` | VARCHAR(45) | NULL | Dirección IP del firmante |
| `user_agent` | TEXT | NULL | User agent del navegador |
| `status` | VARCHAR(50) | DEFAULT 'pending', CHECK | Estado: 'pending', 'signed', 'rejected' |
| `rejection_reason` | TEXT | NULL | Razón del rechazo (si status='rejected') |
| `signed_at` | TIMESTAMP WITH TIME ZONE | NULL | Fecha de firma |
| `rejected_at` | TIMESTAMP WITH TIME ZONE | NULL | Fecha de rechazo |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de creación del registro |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de última actualización |

### Restricciones Únicas
- `UNIQUE(document_id, signer_id)` - Un usuario solo puede firmar un documento una vez

### Índices
- `idx_signatures_document_id` en `document_id`
- `idx_signatures_signer_id` en `signer_id`
- `idx_signatures_status` en `status`

### Relaciones
- **Referencia a**: `documents.id` (ON DELETE CASCADE), `users.id` (ON DELETE CASCADE)

---

## 📋 Tabla 7: `notifications`

**Propósito**: Notificaciones del sistema para usuarios

### Columnas

| Columna | Tipo | Restricciones | Descripción |
|---------|------|--------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Identificador único |
| `user_id` | UUID | NOT NULL, FK → users(id) CASCADE | Usuario destinatario |
| `type` | VARCHAR(50) | NOT NULL | Tipo: 'signature_request', 'document_signed', 'document_completed', 'document_rejected' |
| `document_id` | UUID | FK → documents(id) CASCADE | Documento relacionado |
| `actor_id` | UUID | FK → users(id) SET NULL | Usuario que generó la acción |
| `document_title` | VARCHAR(500) | NULL | Título del documento (copia) |
| `is_read` | BOOLEAN | DEFAULT false | Si la notificación fue leída |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de creación |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de actualización |

### Índices
- `idx_notifications_user_id` en `user_id`
- `idx_notifications_document_id` en `document_id`
- `idx_notifications_is_read` en `is_read`
- `idx_notifications_created_at` en `created_at DESC`

### Relaciones
- **Referencia a**: `users.id` (ON DELETE CASCADE), `documents.id` (ON DELETE CASCADE), `users.id` como actor (ON DELETE SET NULL)

---

## 📋 Tabla 8: `audit_log`

**Propósito**: Registro de auditoría de todas las acciones del sistema

### Columnas

| Columna | Tipo | Restricciones | Descripción |
|---------|------|--------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Identificador único |
| `user_id` | UUID | FK → users(id) SET NULL | Usuario que realizó la acción |
| `action` | VARCHAR(100) | NOT NULL | Acción: 'upload', 'sign', 'reject', 'download', 'delete', etc. |
| `entity_type` | VARCHAR(50) | NOT NULL | Tipo de entidad: 'document', 'signature', 'user' |
| `entity_id` | UUID | NOT NULL | ID de la entidad afectada |
| `details` | JSONB | NULL | Detalles adicionales en formato JSON |
| `ip_address` | VARCHAR(45) | NULL | Dirección IP |
| `user_agent` | TEXT | NULL | User agent del navegador |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Fecha de la acción |

### Índices
- `idx_audit_log_user_id` en `user_id`
- `idx_audit_log_entity` en `(entity_type, entity_id)`
- `idx_audit_log_created_at` en `created_at DESC`

### Relaciones
- **Referencia a**: `users.id` (ON DELETE SET NULL)

---

## 🔍 Vistas

### 1. `v_documents_with_signatures`
Documentos con conteo de firmas

**Columnas**: Todas de `documents` + `uploaded_by_name`, `uploaded_by_email`, `total_signers`, `signed_count`, `pending_count`

### 2. `v_pending_documents_by_user`
Documentos pendientes de firma por usuario

**Columnas**: `user_id`, `document_id`, `title`, `description`, `document_status`, `created_at`, `uploaded_by_name`, `signature_status`

### 3. `v_documents_with_details`
Documentos con información completa (incluyendo tipo)

**Columnas**: Todas de `documents` + `uploaded_by_name`, `uploaded_by_email`, `document_type_name`, `document_type_code`, `document_type_prefix`, `total_signers`, `signed_count`, `pending_count`

---

## ⚙️ Funciones y Triggers

### Función: `update_updated_at_column()`
Actualiza automáticamente el campo `updated_at` al valor actual cuando se modifica un registro.

**Tablas que la usan**:
- `users`
- `documents`
- `signatures`
- `notifications`
- `document_types`

---

## 🔗 Relaciones ON DELETE

### ON DELETE CASCADE (eliminar en cascada)
Cuando se elimina el registro padre, se eliminan todos los hijos:

- `documents` → `signatures`, `document_signers`, `notifications`
- `users` → `documents`, `signatures`, `document_signers`, `notifications`
- `document_types` → `document_type_roles`

### ON DELETE SET NULL (establecer NULL)
Cuando se elimina el registro padre, el campo hijo se establece a NULL:

- `document_types` → `documents.document_type_id`
- `document_type_roles` → `document_signers.assigned_role_id`
- `users` (como actor) → `notifications.actor_id`
- `users` → `audit_log.user_id`

---

## 📝 Datos Iniciales

Al ejecutar el schema completo, se crean automáticamente:

### Tipo de Documento: "Solicitud de Anticipo" (SA)
- **Nombre**: Solicitud de Anticipo
- **Código**: SA
- **Prefijo**: SA -
- **Descripción**: Solicitud de anticipo de fondos con flujo de aprobación por áreas

### Roles para "Solicitud de Anticipo"
1. **Solicitante** (orden 1) - Obligatorio
2. **Aprobador** (orden 2) - Obligatorio
3. **Negociaciones** (orden 3) - Obligatorio
4. **Área Financiera** (orden 4) - Obligatorio
5. **Gerencia Ejecutiva** (orden 5) - Opcional

---

## ✅ Verificación de Integridad

Para verificar que la base de datos está correctamente configurada:

```sql
-- Verificar que todas las tablas existen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Debería devolver: audit_log, document_signers, document_type_roles, document_types, documents, notifications, signatures, users

-- Verificar que el tipo de documento SA existe
SELECT * FROM document_types WHERE code = 'SA';

-- Verificar que los 5 roles para SA existen
SELECT role_name, order_position FROM document_type_roles dtr
JOIN document_types dt ON dtr.document_type_id = dt.id
WHERE dt.code = 'SA'
ORDER BY order_position;

-- Verificar índices
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

---

## 🚀 Para Funcionalidad 100%

Asegúrate de que:
1. ✅ Todas las 8 tablas existen
2. ✅ Todos los índices están creados
3. ✅ La función `update_updated_at_column()` existe
4. ✅ Los 5 triggers están activos
5. ✅ Las 3 vistas están creadas
6. ✅ El tipo de documento "SA" existe con sus 5 roles
7. ✅ Extensión `uuid-ossp` está habilitada

---

**Última actualización**: 2025-11-11
