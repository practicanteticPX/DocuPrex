-- Script para agregar columnas de estado a T_Facturas
-- Ejecutar en SERV_QPREX.crud_facturas

-- Agregar columna en_proceso (indica que hay un documento en proceso con esta factura)
ALTER TABLE crud_facturas."T_Facturas"
ADD COLUMN IF NOT EXISTS en_proceso BOOLEAN DEFAULT FALSE;

-- Agregar columna finalizado (indica que el documento con esta factura fue completamente firmado)
ALTER TABLE crud_facturas."T_Facturas"
ADD COLUMN IF NOT EXISTS finalizado BOOLEAN DEFAULT FALSE;

-- Agregar columna causado (indica que el grupo de causación ya firmó)
ALTER TABLE crud_facturas."T_Facturas"
ADD COLUMN IF NOT EXISTS causado BOOLEAN DEFAULT FALSE;

-- Agregar índices para mejorar rendimiento de búsquedas
CREATE INDEX IF NOT EXISTS idx_facturas_en_proceso
ON crud_facturas."T_Facturas" (en_proceso);

CREATE INDEX IF NOT EXISTS idx_facturas_finalizado
ON crud_facturas."T_Facturas" (finalizado);

CREATE INDEX IF NOT EXISTS idx_facturas_causado
ON crud_facturas."T_Facturas" (causado);

-- Comentarios para documentación
COMMENT ON COLUMN crud_facturas."T_Facturas".en_proceso IS 'Indica si actualmente hay un documento en proceso con esta factura';
COMMENT ON COLUMN crud_facturas."T_Facturas".finalizado IS 'Indica si el documento con esta factura fue completamente firmado';
COMMENT ON COLUMN crud_facturas."T_Facturas".causado IS 'Indica si el grupo de causación ya firmó el documento';

-- Verificar que las columnas se crearon correctamente
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'crud_facturas'
  AND table_name = 'T_Facturas'
  AND column_name IN ('en_proceso', 'finalizado', 'causado');
