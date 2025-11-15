-- ==================================================
-- SCHEMA COMPLETO - Sistema de Firmas Digitales DocuPrex
-- ==================================================
-- Este archivo contiene TODA la estructura de la base de datos
-- Ejecutar este archivo creará/actualizará la BD completa con:
--   ✅ 8 Tablas con todas las columnas
--   ✅ Todas las relaciones (FK) con ON DELETE CASCADE
--   ✅ Todos los índices
--   ✅ Todas las funciones y triggers
--   ✅ Todas las vistas
--   ✅ Datos iniciales (Tipo documento SA + roles)
-- ==================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================================================
-- TABLA 1: users
-- Almacena información de usuarios del sistema
-- Los usuarios se sincronizan desde Active Directory
-- ==================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE CASCADE,
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    file_name VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size INTEGER NOT NULL, -- Tamaño en bytes
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'archived')),
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type_id UUID REFERENCES document_types(id) ON DELETE SET NULL, -- Tipo de documento (SA, etc)
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_position INTEGER DEFAULT 0, -- Orden de firma (0 = sin orden específico)
    is_required BOOLEAN DEFAULT true, -- Si la firma es obligatoria
    assigned_role_id UUID REFERENCES document_type_roles(id) ON DELETE SET NULL, -- Rol asignado
    role_name VARCHAR(255), -- Copia desnormalizada del nombre del rol para histórico
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    signer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signature_data TEXT, -- Datos de la firma digital (base64, hash, etc.)
    signature_type VARCHAR(50) DEFAULT 'digital' CHECK (signature_type IN ('digital', 'electronic', 'handwritten')),
    ip_address VARCHAR(45), -- IPv4 o IPv6
    user_agent TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'rejected')),
    rejection_reason TEXT, -- Razón del rechazo cuando status = 'rejected'
    signed_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE, -- Fecha de rechazo cuando status = 'rejected'
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'signature_request', 'document_signed', 'document_completed', 'document_rejected'
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
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
-- TABLA 8: audit_log
-- Registro de auditoría para trazabilidad
-- ==================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- 'upload', 'sign', 'reject', 'download', 'delete', etc.
    entity_type VARCHAR(50) NOT NULL, -- 'document', 'signature', 'user'
    entity_id UUID NOT NULL,
    details JSONB, -- Detalles adicionales en formato JSON
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

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
WHERE COALESCE(s.status, 'pending') = 'pending'
    AND d.status NOT IN ('completed', 'archived');

-- Vista: documentos con detalles completos (incluyendo tipo)
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

-- ==================================================
-- COMENTARIOS EN LAS TABLAS
-- ==================================================
COMMENT ON TABLE users IS 'Usuarios del sistema con autenticación AD o local';
COMMENT ON TABLE documents IS 'Documentos subidos para firma digital';
COMMENT ON TABLE signatures IS 'Firmas digitales realizadas en los documentos';
COMMENT ON TABLE document_signers IS 'Usuarios asignados para firmar cada documento';
COMMENT ON TABLE audit_log IS 'Registro de auditoría de todas las acciones del sistema';
COMMENT ON TABLE notifications IS 'Notificaciones del sistema para usuarios';
COMMENT ON TABLE document_types IS 'Tipos de documentos con prefijos y configuración específica';
COMMENT ON TABLE document_type_roles IS 'Roles específicos requeridos para cada tipo de documento';

-- Comentarios en columnas importantes
COMMENT ON COLUMN users.email_notifications IS 'Indica si el usuario desea recibir notificaciones por email';
COMMENT ON COLUMN documents.document_type_id IS 'Tipo de documento asignado';
COMMENT ON COLUMN document_signers.assigned_role_id IS 'Rol asignado al firmante en este documento';
COMMENT ON COLUMN document_signers.role_name IS 'Nombre del rol (copia histórica)';
COMMENT ON COLUMN signatures.rejection_reason IS 'Razón del rechazo cuando status = rejected';
COMMENT ON COLUMN signatures.rejected_at IS 'Fecha de rechazo cuando status = rejected';

-- ==================================================
-- DATOS INICIALES
-- ==================================================

-- Tipo de Documento: "Solicitud de Anticipo" (SA)
INSERT INTO document_types (name, code, prefix, description)
VALUES (
    'Solicitud de Anticipo',
    'SA',
    'SA -',
    'Solicitud de anticipo de fondos con flujo de aprobación por áreas'
) ON CONFLICT (code) DO NOTHING;

-- Obtener el ID del tipo de documento y crear roles
DO $$
DECLARE
    doc_type_id UUID;
BEGIN
    SELECT id INTO doc_type_id FROM document_types WHERE code = 'SA';

    -- Roles para "Solicitud de Anticipo"
    INSERT INTO document_type_roles (document_type_id, role_name, role_code, order_position, is_required, description)
    VALUES
        (doc_type_id, 'Solicitante', 'SOLICITANTE', 1, true, 'Persona que solicita el anticipo'),
        (doc_type_id, 'Aprobador', 'APROBADOR', 2, true, 'Persona que aprueba la solicitud'),
        (doc_type_id, 'Negociaciones', 'NEGOCIACIONES', 3, true, 'Área de negociaciones'),
        (doc_type_id, 'Área Financiera', 'AREA_FINANCIERA', 4, true, 'Área financiera'),
        (doc_type_id, 'Gerencia Ejecutiva', 'GERENCIA_EJECUTIVA', 5, false, 'Gerencia ejecutiva (opcional)'),
        (doc_type_id, 'Tesorería', 'TESORERIA', 6, true, 'Área de tesorería')
    ON CONFLICT (document_type_id, role_code) DO NOTHING;
END $$;

-- ==================================================
-- FIN DEL SCHEMA
-- ==================================================
-- La base de datos está lista para usar
-- Todos los usuarios deben autenticarse vía Active Directory
-- ==================================================
