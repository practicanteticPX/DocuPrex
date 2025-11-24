-- Migration: Crear tabla para almacenar usuarios de Negociaciones con sus cédulas
-- Fecha: 2025-11-24
-- Descripción: Permite verificar la identidad del firmante real pidiendo los últimos 4 dígitos de su cédula

CREATE TABLE IF NOT EXISTS negotiation_signers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  cedula VARCHAR(20) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar los usuarios iniciales de Negociaciones
INSERT INTO negotiation_signers (name, cedula) VALUES
  ('Carolina Martinez', '1234'), -- Reemplazar con cédula real
  ('Valentina Arroyave', '5678'), -- Reemplazar con cédula real
  ('Manuela Correa', '9012'), -- Reemplazar con cédula real
  ('Luisa Velez', '3456'), -- Reemplazar con cédula real
  ('Sebastian Pinto', '7890'); -- Reemplazar con cédula real

-- Comentario: Los valores de cédula son de ejemplo, deben ser reemplazados con las cédulas reales

-- Crear índice para búsquedas rápidas
CREATE INDEX idx_negotiation_signers_name ON negotiation_signers(name);
CREATE INDEX idx_negotiation_signers_active ON negotiation_signers(active);

COMMENT ON TABLE negotiation_signers IS 'Usuarios autorizados para usar la cuenta de Negociaciones con sus cédulas para verificación';
COMMENT ON COLUMN negotiation_signers.cedula IS 'Cédula completa del usuario (se verificarán los últimos 4 dígitos)';
