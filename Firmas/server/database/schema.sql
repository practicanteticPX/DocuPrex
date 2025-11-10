-- ==================================================
-- Schema de Base de Datos - Sistema de Firmas Digitales
-- ==================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================================================
-- Tabla: users
-- Almacena información de usuarios del sistema
-- ==================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    ad_username VARCHAR(255), -- Usuario de Active Directory
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_ad_username ON users(ad_username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ==================================================
-- Tabla: documents
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Índices para documents
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- ==================================================
-- Tabla: signatures
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
-- Tabla: document_signers
-- Tabla intermedia para gestionar quiénes deben firmar cada documento
-- ==================================================
CREATE TABLE IF NOT EXISTS document_signers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_position INTEGER DEFAULT 0, -- Orden de firma (0 = sin orden específico)
    is_required BOOLEAN DEFAULT true, -- Si la firma es obligatoria
    notified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Restricción: Un usuario solo puede ser asignado una vez por documento
    UNIQUE(document_id, user_id)
);

-- Índices para document_signers
CREATE INDEX IF NOT EXISTS idx_document_signers_document_id ON document_signers(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_user_id ON document_signers(user_id);

-- ==================================================
-- Tabla: audit_log
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
-- Tabla: notifications
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

-- Trigger para actualizar updated_at en notifications
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================================================
-- Función: update_updated_at_column
-- Actualiza automáticamente el campo updated_at
-- ==================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
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

-- ==================================================
-- Vistas útiles
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

-- ==================================================
-- Datos iniciales (opcional)
-- ==================================================

-- Crear usuario admin por defecto (password: admin123)
-- Hash bcrypt de 'admin123': $2a$10$rT8qKqXGJ5Kh5L8N3L3yYuZvXH5xYH5xYH5xYH5xYH5xYH5xYH5x
INSERT INTO users (name, email, password_hash, role)
VALUES ('Administrador', 'admin@prexxa.local', '$2a$10$rT8qKqXGJ5Kh5L8N3L3yYuZvXH5xYH5xYH5xYH5xYH5xYH5xYH5x', 'admin')
ON CONFLICT (email) DO NOTHING;

-- ==================================================
-- Comentarios en las tablas
-- ==================================================
COMMENT ON TABLE users IS 'Usuarios del sistema con autenticación AD o local';
COMMENT ON TABLE documents IS 'Documentos subidos para firma digital';
COMMENT ON TABLE signatures IS 'Firmas digitales realizadas en los documentos';
COMMENT ON TABLE document_signers IS 'Usuarios asignados para firmar cada documento';
COMMENT ON TABLE audit_log IS 'Registro de auditoría de todas las acciones del sistema';
COMMENT ON TABLE notifications IS 'Notificaciones del sistema para usuarios';
