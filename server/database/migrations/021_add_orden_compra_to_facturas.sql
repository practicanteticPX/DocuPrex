-- Migration: Agregar numero de orden de compra a facturas

ALTER TABLE crud_facturas."T_Facturas"
ADD COLUMN IF NOT EXISTS orden_compra VARCHAR(120);

COMMENT ON COLUMN crud_facturas."T_Facturas".orden_compra
IS 'Numero de orden de compra diligenciado en la planilla de factura de DocuPrex';
