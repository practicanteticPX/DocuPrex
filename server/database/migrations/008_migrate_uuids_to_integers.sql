-- ============================================================
-- MIGRACIÓN COMPLETA: UUID -> INTEGER (IDs Numéricas)
-- ============================================================
-- ADVERTENCIA: Este script cambia TODAS las IDs UUID a INTEGER
-- Fecha: 2025-12-05
--
-- IMPORTANTE:
-- 1. Hacer backup ANTES de ejecutar este script
-- 2. Revisar que no haya operaciones en curso
-- 3. Ejecutar en un entorno de prueba primero
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 0: ELIMINAR VISTAS QUE DEPENDEN DE LAS COLUMNAS
-- ============================================================

DROP VIEW IF EXISTS v_documents_with_signatures CASCADE;
DROP VIEW IF EXISTS v_pending_documents_by_user CASCADE;
DROP VIEW IF EXISTS v_documents_with_details CASCADE;

-- ============================================================
-- PASO 1: AGREGAR COLUMNAS TEMPORALES DE ID NUMÉRICAS
-- ============================================================

-- Tabla users
ALTER TABLE users ADD COLUMN id_new SERIAL;

-- Tabla documents
ALTER TABLE documents ADD COLUMN id_new SERIAL;
ALTER TABLE documents ADD COLUMN uploaded_by_new INTEGER;
ALTER TABLE documents ADD COLUMN document_type_id_new INTEGER;

-- Tabla document_types
ALTER TABLE document_types ADD COLUMN id_new SERIAL;

-- Tabla document_type_roles
ALTER TABLE document_type_roles ADD COLUMN id_new SERIAL;
ALTER TABLE document_type_roles ADD COLUMN document_type_id_new INTEGER;

-- Tabla document_signers
ALTER TABLE document_signers ADD COLUMN id_new SERIAL;
ALTER TABLE document_signers ADD COLUMN document_id_new INTEGER;
ALTER TABLE document_signers ADD COLUMN user_id_new INTEGER;

-- Tabla signatures
ALTER TABLE signatures ADD COLUMN id_new SERIAL;
ALTER TABLE signatures ADD COLUMN document_id_new INTEGER;
ALTER TABLE signatures ADD COLUMN signer_id_new INTEGER;

-- Tabla notifications
ALTER TABLE notifications ADD COLUMN id_new SERIAL;
ALTER TABLE notifications ADD COLUMN document_id_new INTEGER;
ALTER TABLE notifications ADD COLUMN user_id_new INTEGER;
ALTER TABLE notifications ADD COLUMN actor_id_new INTEGER;

-- Tabla causacion_integrantes
ALTER TABLE causacion_integrantes ADD COLUMN user_id_new INTEGER;

-- ============================================================
-- PASO 2: CREAR TABLAS DE MAPEO UUID -> INTEGER
-- ============================================================

CREATE TEMP TABLE users_mapping AS
SELECT id AS old_id, id_new AS new_id FROM users;

CREATE TEMP TABLE documents_mapping AS
SELECT id AS old_id, id_new AS new_id FROM documents;

CREATE TEMP TABLE document_types_mapping AS
SELECT id AS old_id, id_new AS new_id FROM document_types;

CREATE TEMP TABLE document_type_roles_mapping AS
SELECT id AS old_id, id_new AS new_id FROM document_type_roles;

CREATE TEMP TABLE document_signers_mapping AS
SELECT id AS old_id, id_new AS new_id FROM document_signers;

CREATE TEMP TABLE signatures_mapping AS
SELECT id AS old_id, id_new AS new_id FROM signatures;

CREATE TEMP TABLE notifications_mapping AS
SELECT id AS old_id, id_new AS new_id FROM notifications;

-- ============================================================
-- PASO 3: POBLAR LAS FOREIGN KEYS NUMÉRICAS
-- ============================================================

-- documents.uploaded_by
UPDATE documents d
SET uploaded_by_new = um.new_id
FROM users_mapping um
WHERE d.uploaded_by = um.old_id;

-- documents.document_type_id (si existe)
UPDATE documents d
SET document_type_id_new = dtm.new_id
FROM document_types_mapping dtm
WHERE d.document_type_id = dtm.old_id;

-- document_type_roles.document_type_id
UPDATE document_type_roles dtr
SET document_type_id_new = dtm.new_id
FROM document_types_mapping dtm
WHERE dtr.document_type_id = dtm.old_id;

-- document_signers
UPDATE document_signers ds
SET
  document_id_new = dm.new_id,
  user_id_new = um.new_id
FROM documents_mapping dm, users_mapping um
WHERE ds.document_id = dm.old_id
  AND ds.user_id = um.old_id;

-- signatures
UPDATE signatures s
SET
  document_id_new = dm.new_id,
  signer_id_new = um.new_id
FROM documents_mapping dm, users_mapping um
WHERE s.document_id = dm.old_id
  AND s.signer_id = um.old_id;

-- notifications
UPDATE notifications n
SET
  document_id_new = COALESCE((SELECT new_id FROM documents_mapping WHERE old_id = n.document_id), NULL),
  user_id_new = um.new_id,
  actor_id_new = COALESCE((SELECT new_id FROM users_mapping WHERE old_id = n.actor_id), NULL)
FROM users_mapping um
WHERE n.user_id = um.old_id;

-- causacion_integrantes
UPDATE causacion_integrantes ci
SET user_id_new = um.new_id
FROM users_mapping um
WHERE ci.user_id = um.old_id;

-- ============================================================
-- PASO 4: ELIMINAR CONSTRAINTS DE FOREIGN KEYS VIEJAS
-- ============================================================

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_uploaded_by_fkey;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_id_fkey;
ALTER TABLE document_type_roles DROP CONSTRAINT IF EXISTS document_type_roles_document_type_id_fkey;
ALTER TABLE document_signers DROP CONSTRAINT IF EXISTS document_signers_document_id_fkey;
ALTER TABLE document_signers DROP CONSTRAINT IF EXISTS document_signers_user_id_fkey;
ALTER TABLE signatures DROP CONSTRAINT IF EXISTS signatures_document_id_fkey;
ALTER TABLE signatures DROP CONSTRAINT IF EXISTS signatures_signer_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_document_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;
ALTER TABLE causacion_integrantes DROP CONSTRAINT IF EXISTS causacion_integrantes_user_id_fkey;

-- ============================================================
-- PASO 5: ELIMINAR PRIMARY KEYS VIEJAS Y COLUMNAS UUID
-- ============================================================

-- users
ALTER TABLE users DROP CONSTRAINT users_pkey;
ALTER TABLE users DROP COLUMN id;
ALTER TABLE users RENAME COLUMN id_new TO id;
ALTER TABLE users ADD PRIMARY KEY (id);

-- documents
ALTER TABLE documents DROP CONSTRAINT documents_pkey;
ALTER TABLE documents DROP COLUMN id;
ALTER TABLE documents DROP COLUMN uploaded_by;
ALTER TABLE documents DROP COLUMN document_type_id;
ALTER TABLE documents RENAME COLUMN id_new TO id;
ALTER TABLE documents RENAME COLUMN uploaded_by_new TO uploaded_by;
ALTER TABLE documents RENAME COLUMN document_type_id_new TO document_type_id;
ALTER TABLE documents ADD PRIMARY KEY (id);

-- document_types
ALTER TABLE document_types DROP CONSTRAINT document_types_pkey;
ALTER TABLE document_types DROP COLUMN id;
ALTER TABLE document_types RENAME COLUMN id_new TO id;
ALTER TABLE document_types ADD PRIMARY KEY (id);

-- document_type_roles
ALTER TABLE document_type_roles DROP CONSTRAINT document_type_roles_pkey;
ALTER TABLE document_type_roles DROP COLUMN id;
ALTER TABLE document_type_roles DROP COLUMN document_type_id;
ALTER TABLE document_type_roles RENAME COLUMN id_new TO id;
ALTER TABLE document_type_roles RENAME COLUMN document_type_id_new TO document_type_id;
ALTER TABLE document_type_roles ADD PRIMARY KEY (id);

-- document_signers
ALTER TABLE document_signers DROP CONSTRAINT document_signers_pkey;
ALTER TABLE document_signers DROP COLUMN id;
ALTER TABLE document_signers DROP COLUMN document_id;
ALTER TABLE document_signers DROP COLUMN user_id;
ALTER TABLE document_signers RENAME COLUMN id_new TO id;
ALTER TABLE document_signers RENAME COLUMN document_id_new TO document_id;
ALTER TABLE document_signers RENAME COLUMN user_id_new TO user_id;
ALTER TABLE document_signers ADD PRIMARY KEY (id);

-- signatures
ALTER TABLE signatures DROP CONSTRAINT signatures_pkey;
ALTER TABLE signatures DROP COLUMN id;
ALTER TABLE signatures DROP COLUMN document_id;
ALTER TABLE signatures DROP COLUMN signer_id;
ALTER TABLE signatures RENAME COLUMN id_new TO id;
ALTER TABLE signatures RENAME COLUMN document_id_new TO document_id;
ALTER TABLE signatures RENAME COLUMN signer_id_new TO signer_id;
ALTER TABLE signatures ADD PRIMARY KEY (id);

-- notifications
ALTER TABLE notifications DROP CONSTRAINT notifications_pkey;
ALTER TABLE notifications DROP COLUMN id;
ALTER TABLE notifications DROP COLUMN document_id;
ALTER TABLE notifications DROP COLUMN user_id;
ALTER TABLE notifications DROP COLUMN actor_id;
ALTER TABLE notifications RENAME COLUMN id_new TO id;
ALTER TABLE notifications RENAME COLUMN document_id_new TO document_id;
ALTER TABLE notifications RENAME COLUMN user_id_new TO user_id;
ALTER TABLE notifications RENAME COLUMN actor_id_new TO actor_id;
ALTER TABLE notifications ADD PRIMARY KEY (id);

-- causacion_integrantes (solo user_id, no tiene PK UUID)
ALTER TABLE causacion_integrantes DROP COLUMN user_id;
ALTER TABLE causacion_integrantes RENAME COLUMN user_id_new TO user_id;

-- ============================================================
-- PASO 6: RECREAR FOREIGN KEYS
-- ============================================================

ALTER TABLE documents
  ADD CONSTRAINT documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_id_fkey
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE SET NULL;

ALTER TABLE document_type_roles
  ADD CONSTRAINT document_type_roles_document_type_id_fkey
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE;

ALTER TABLE document_signers
  ADD CONSTRAINT document_signers_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE document_signers
  ADD CONSTRAINT document_signers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE signatures
  ADD CONSTRAINT signatures_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE signatures
  ADD CONSTRAINT signatures_signer_id_fkey
  FOREIGN KEY (signer_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE causacion_integrantes
  ADD CONSTRAINT causacion_integrantes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================
-- PASO 7: RECREAR ÍNDICES
-- ============================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_ad_username ON users(ad_username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type_id);

-- document_signers
CREATE INDEX IF NOT EXISTS idx_document_signers_document ON document_signers(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_user ON document_signers(user_id);

-- signatures
CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signer ON signatures(signer_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_document ON notifications(document_id);

-- ============================================================
-- PASO 8: ELIMINAR EXTENSIÓN UUID (OPCIONAL)
-- ============================================================
-- DROP EXTENSION IF EXISTS "uuid-ossp";

COMMIT;

-- ============================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================
SELECT 'users' as tabla, count(*) as registros FROM users
UNION ALL
SELECT 'documents', count(*) FROM documents
UNION ALL
SELECT 'document_types', count(*) FROM document_types
UNION ALL
SELECT 'document_signers', count(*) FROM document_signers
UNION ALL
SELECT 'signatures', count(*) FROM signatures
UNION ALL
SELECT 'notifications', count(*) FROM notifications
UNION ALL
SELECT 'causacion_integrantes', count(*) FROM causacion_integrantes;
