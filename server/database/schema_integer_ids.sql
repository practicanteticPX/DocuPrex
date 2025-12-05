-- ==================================================
-- SCHEMA COMPLETO - Sistema de Firmas Digitales DocuPrex (IDs NUMÉRICAS)
-- ==================================================
-- Este archivo contiene TODA la estructura de la base de datos con IDs INTEGER
-- Ejecutar este archivo creará/actualizará la BD completa con:
--   ✅ Todas las tablas con IDs numéricas secuenciales
--   ✅ Todas las relaciones (FK) con ON DELETE CASCADE
--   ✅ Todos los índices
--   ✅ Todas las funciones y triggers
--   ✅ Todas las vistas
--   ✅ Datos iniciales (Tipo documento SA + roles)
-- ==================================================

-- ==================================================
-- TABLA 1: users
-- Almacena información de usuarios del sistema
-- Los usuarios se sincronizan desde Active Directory
-- ==================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Opcional, para usuarios locales
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    ad_username VARCHAR(255), -- Usuario de Active Directory
    is_active BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true, -- Preferencia de notificaciones por email
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_ad_username ON users(ad_username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ==================================================
-- TABLA 2: document_types
-- Define los tipos de documentos disponibles en el sistema
-- Ej: "Solicitud de Anticipo" (SA)
-- ==================================================
CREATE TABLE IF NOT EXISTS document_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE, -- Ej: "Solicitud de Anticipo"
    code VARCHAR(50) NOT NULL UNIQUE, -- Ej: "SA" (código interno)
    description TEXT,
    prefix VARCHAR(50) NOT NULL, -- Ej: "SA -" (prefijo que se muestra en el título)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para document_types
CREATE INDEX IF NOT EXISTS idx_document_types_code ON document_types(code);
CREATE INDEX IF NOT EXISTS idx_document_types_is_active ON document_types(is_active);

-- ==================================================
-- TABLA 3: document_type_roles
-- Define los roles específicos para cada tipo de documento
-- Ej: Para "SA" tiene roles: Solicitante, Aprobador, Negociaciones, etc.
-- ==================================================
CREATE TABLE IF NOT EXISTS document_type_roles (
    id SERIAL PRIMARY KEY,
    document_type_id INTEGER NOT NULL REFERENCES document_types(id) ON DELETE CASCADE,
    role_name VARCHAR(255) NOT NULL, -- Ej: "Solicitante", "Aprobador"
    role_code VARCHAR(50) NOT NULL, -- Ej: "SOLICITANTE", "APROBADOR"
    order_position INTEGER NOT NULL, -- Orden en que aparece el rol (1, 2, 3...)
    is_required BOOLEAN DEFAULT true, -- Si es obligatorio asignar este rol
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Un tipo de documento no puede tener roles duplicados
    UNIQUE(document_type_id, role_code)
);

-- Índices para document_type_roles
CREATE INDEX IF NOT EXISTS idx_document_type_roles_document_type ON document_type_roles(document_type_id);
CREATE INDEX IF NOT EXISTS idx_document_type_roles_order ON document_type_roles(document_type_id, order_position);

-- ==================================================
-- TABLA 4: documents
-- Almacena documentos subidos al sistema
-- ==================================================
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    file_name VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size INTEGER NOT NULL, -- Tamaño en bytes
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'archived')),
    uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type_id INTEGER REFERENCES document_types(id) ON DELETE SET NULL, -- Tipo de documento (SA, etc)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Índices para documents
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type_id);

-- ==================================================
-- TABLA 5: document_signers
-- Tabla intermedia para gestionar quiénes deben firmar cada documento
-- ==================================================
CREATE TABLE IF NOT EXISTS document_signers (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_position INTEGER DEFAULT 0, -- Orden de firma (0 = sin orden específico)
    is_required BOOLEAN DEFAULT true, -- Si la firma es obligatoria
    assigned_role_id INTEGER REFERENCES document_type_roles(id) ON DELETE SET NULL, -- Rol asignado
    role_name VARCHAR(255), -- Copia desnormalizada del nombre del rol para histórico
    assigned_role_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], -- Array de IDs de roles asignados
    role_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], -- Array de nombres de roles
    notified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Restricción: Un usuario solo puede ser asignado una vez por documento
    UNIQUE(document_id, user_id)
);

-- Índices para document_signers
CREATE INDEX IF NOT EXISTS idx_document_signers_document_id ON document_signers(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_user_id ON document_signers(user_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_role ON document_signers(assigned_role_id);

-- ==================================================
-- TABLA 6: signatures
-- Almacena las firmas digitales de los documentos
-- ==================================================
CREATE TABLE IF NOT EXISTS signatures (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    signer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signature_data TEXT, -- Datos de la firma digital (base64, hash, etc.)
    signature_type VARCHAR(50) DEFAULT 'digital' CHECK (signature_type IN ('digital', 'electronic', 'handwritten')),
    ip_address VARCHAR(45), -- IPv4 o IPv6
    user_agent TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'rejected')),
    rejection_reason TEXT, -- Razón del rechazo cuando status = 'rejected'
    signed_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE, -- Fecha de rechazo cuando status = 'rejected'
    reminder_sent_at TIMESTAMP WITH TIME ZONE, -- Timestamp del último recordatorio enviado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Restricción: Un usuario solo puede firmar un documento una vez
    UNIQUE(document_id, signer_id)
);

-- Índices para signatures
CREATE INDEX IF NOT EXISTS idx_signatures_document_id ON signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signer_id ON signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_signatures_status ON signatures(status);

-- ==================================================
-- TABLA 7: notifications
-- Notificaciones del sistema para usuarios
-- ==================================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'signature_request', 'document_signed', 'document_completed', 'document_rejected'
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    document_title VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_document_id ON notifications(document_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ==================================================
-- TABLA 8: negotiation_signers
-- Usuarios autorizados para firmar como Negociaciones
-- ==================================================
CREATE TABLE IF NOT EXISTS negotiation_signers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  cedula VARCHAR(20) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_negotiation_signers_name ON negotiation_signers(name);
CREATE INDEX IF NOT EXISTS idx_negotiation_signers_active ON negotiation_signers(active);

COMMENT ON TABLE negotiation_signers IS 'Usuarios autorizados para usar la cuenta de Negociaciones con sus cédulas para verificación';
COMMENT ON COLUMN negotiation_signers.cedula IS 'Cédula completa del usuario (se verificarán los últimos 4 dígitos)';

-- ==================================================
-- TABLA 9: causacion_grupos
-- Grupos de causación para facturas
-- ==================================================
CREATE TABLE IF NOT EXISTS causacion_grupos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_causacion_grupos_codigo ON causacion_grupos(codigo);
CREATE INDEX IF NOT EXISTS idx_causacion_grupos_activo ON causacion_grupos(activo);

COMMENT ON TABLE causacion_grupos IS 'Grupos disponibles para el proceso de causación de facturas';

-- ==================================================
-- TABLA 10: causacion_integrantes
-- Integrantes de los grupos de causación
-- ==================================================
CREATE TABLE IF NOT EXISTS causacion_integrantes (
  id SERIAL PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES causacion_grupos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cargo VARCHAR(255) DEFAULT 'Causación',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(grupo_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_grupo ON causacion_integrantes(grupo_id);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_user ON causacion_integrantes(user_id);
CREATE INDEX IF NOT EXISTS idx_causacion_integrantes_activo ON causacion_integrantes(activo);

COMMENT ON TABLE causacion_integrantes IS 'Integrantes de cada grupo de causación (referencia directa a users)';

-- ==================================================
-- FUNCIONES Y TRIGGERS
-- ==================================================

-- Función: update_updated_at_column
-- Actualiza automáticamente el campo updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at automáticamente
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signatures_updated_at
    BEFORE UPDATE ON signatures
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_types_updated_at
    BEFORE UPDATE ON document_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================================================
-- VISTAS
-- ==================================================

-- Vista: documentos con conteo de firmas
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

-- Vista: documentos pendientes por usuario
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
WHERE d.status IN ('pending', 'in_progress')
AND COALESCE(s.status, 'pending') = 'pending';

-- Vista: detalles completos de documentos
CREATE OR REPLACE VIEW v_documents_with_details AS
SELECT
    d.id,
    d.title,
    d.description,
    d.file_name,
    d.file_path,
    d.file_size,
    d.mime_type,
    d.status,
    d.uploaded_by,
    d.document_type_id,
    d.created_at,
    d.updated_at,
    d.completed_at,
    u.name as uploaded_by_name,
    u.email as uploaded_by_email,
    dt.name as document_type_name,
    dt.code as document_type_code,
    dt.prefix as document_type_prefix
FROM documents d
LEFT JOIN users u ON d.uploaded_by = u.id
LEFT JOIN document_types dt ON d.document_type_id = dt.id;

-- ==================================================
-- DATOS INICIALES
-- ==================================================

-- Insertar tipo de documento SA (Solicitud de Anticipo)
INSERT INTO document_types (name, code, description, prefix, is_active)
VALUES
    ('Solicitud de Anticipo', 'SA', 'Solicitud de anticipo para proveedores', 'SA -', true)
ON CONFLICT (code) DO NOTHING;

-- Obtener el ID del tipo de documento SA
DO $$
DECLARE
    sa_type_id INTEGER;
BEGIN
    SELECT id INTO sa_type_id FROM document_types WHERE code = 'SA';

    -- Insertar roles para el documento tipo SA
    INSERT INTO document_type_roles (document_type_id, role_name, role_code, order_position, is_required, description)
    VALUES
        (sa_type_id, 'Solicitante', 'SOLICITANTE', 1, true, 'Persona que solicita el anticipo'),
        (sa_type_id, 'Aprobador', 'APROBADOR', 2, true, 'Persona que aprueba la solicitud'),
        (sa_type_id, 'Negociaciones', 'NEGOCIACIONES', 3, true, 'Equipo de negociaciones'),
        (sa_type_id, 'Tesorería', 'TESORERIA', 4, true, 'Equipo de tesorería'),
        (sa_type_id, 'Gerencia', 'GERENCIA', 5, true, 'Gerencia general')
    ON CONFLICT (document_type_id, role_code) DO NOTHING;
END $$;

-- Insertar grupos de causación
INSERT INTO causacion_grupos (codigo, nombre, descripcion) VALUES
  ('financiera', 'Financiera', 'Grupo de causación del área financiera'),
  ('logistica', 'Logística', 'Grupo de causación del área de logística')
ON CONFLICT (codigo) DO NOTHING;

-- Insertar usuarios iniciales de Negociaciones
INSERT INTO negotiation_signers (name, cedula) VALUES
  ('Carolina Martinez', '1234'),
  ('Valentina Arroyave', '5678'),
  ('Manuela Correa', '9012'),
  ('Luisa Velez', '3456'),
  ('Sebastian Pinto', '7890')
ON CONFLICT (name) DO NOTHING;
