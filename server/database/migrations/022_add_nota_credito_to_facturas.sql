-- Migration: Agregar indicador de nota credito a facturas

ALTER TABLE crud_facturas."T_Facturas"
ADD COLUMN IF NOT EXISTS nota_credito BOOLEAN DEFAULT false;

COMMENT ON COLUMN crud_facturas."T_Facturas".nota_credito
IS 'Indica si el documento registrado corresponde a una nota credito';
