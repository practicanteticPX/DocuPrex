-- Migration: Desactivar firmantes de Negociaciones
-- Fecha: 2026-04-17
-- Objetivo:
--   - Sebastian Pinto
--   - Manuela Correa

BEGIN;

UPDATE negotiation_signers
SET
  active = false,
  updated_at = CURRENT_TIMESTAMP
WHERE name IN ('Sebastian Pinto', 'Manuela Correa');

COMMIT;
