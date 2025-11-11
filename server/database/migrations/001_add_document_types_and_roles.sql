-- ==================================================
-- Migración: Agregar Tipos de Documentos y Roles de Firmantes
-- ==================================================

-- ==================================================
-- Tabla: document_types
-- Define los tipos de documentos disponibles en el sistema
-- ==================================================
CREATE TABLE IF NOT EXISTS document_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE, -- Ej: "Solicitud de Anticipo"
    code VARCHAR(50) NOT NULL UNIQUE, -- Ej: "SA" (para prefijo)
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
-- Tabla: document_type_roles
-- Define los roles específicos para cada tipo de documento
-- ==================================================
CREATE TABLE IF NOT EXISTS document_type_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE CASCADE,
    role_name VARCHAR(255) NOT NULL, -- Ej: "Solicitante", "Aprobador", "Gerencia Ejecutiva"
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
-- Modificar tabla documents para agregar tipo de documento
-- ==================================================
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS document_type_id UUID REFERENCES document_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type_id);

-- ==================================================
-- Modificar tabla document_signers para agregar rol asignado
-- ==================================================
ALTER TABLE document_signers
ADD COLUMN IF NOT EXISTS assigned_role_id UUID REFERENCES document_type_roles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS role_name VARCHAR(255); -- Copia desnormalizada del nombre del rol para histórico

CREATE INDEX IF NOT EXISTS idx_document_signers_role ON document_signers(assigned_role_id);

-- ==================================================
-- Trigger para actualizar updated_at en document_types
-- ==================================================
CREATE TRIGGER update_document_types_updated_at
    BEFORE UPDATE ON document_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================================================
-- Datos iniciales: Tipo de Documento "Solicitud de Anticipo"
-- ==================================================

-- Crear el tipo de documento
INSERT INTO document_types (name, code, prefix, description)
VALUES (
    'Solicitud de Anticipo',
    'SA',
    'SA -',
    'Solicitud de anticipo de fondos con flujo de aprobación por áreas'
) ON CONFLICT (code) DO NOTHING;

-- Obtener el ID del tipo de documento recién creado (o existente)
DO $$
DECLARE
    doc_type_id UUID;
BEGIN
    SELECT id INTO doc_type_id FROM document_types WHERE code = 'SA';

    -- Crear los roles para "Solicitud de Anticipo"
    INSERT INTO document_type_roles (document_type_id, role_name, role_code, order_position, is_required, description)
    VALUES
        (doc_type_id, 'Solicitante', 'SOLICITANTE', 1, true, 'Persona que solicita el anticipo'),
        (doc_type_id, 'Aprobador', 'APROBADOR', 2, true, 'Persona que aprueba la solicitud'),
        (doc_type_id, 'Negociaciones', 'NEGOCIACIONES', 3, true, 'Área de negociaciones'),
        (doc_type_id, 'Área Financiera', 'AREA_FINANCIERA', 4, true, 'Área financiera'),
        (doc_type_id, 'Gerencia Ejecutiva', 'GERENCIA_EJECUTIVA', 5, false, 'Gerencia ejecutiva (opcional)')
    ON CONFLICT (document_type_id, role_code) DO NOTHING;
END $$;

-- ==================================================
-- Vista actualizada: documentos con tipo y roles
-- ==================================================
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
-- Comentarios en las nuevas tablas
-- ==================================================
COMMENT ON TABLE document_types IS 'Tipos de documentos con prefijos y configuración específica';
COMMENT ON TABLE document_type_roles IS 'Roles específicos requeridos para cada tipo de documento';
COMMENT ON COLUMN documents.document_type_id IS 'Tipo de documento asignado';
COMMENT ON COLUMN document_signers.assigned_role_id IS 'Rol asignado al firmante en este documento';
COMMENT ON COLUMN document_signers.role_name IS 'Nombre del rol (copia histórica)';
