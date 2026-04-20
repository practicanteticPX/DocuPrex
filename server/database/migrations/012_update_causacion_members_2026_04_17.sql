-- Migration: Actualizar integrantes de grupos de causacion
-- Fecha: 2026-04-17
-- Objetivo:
--   financiera -> Luis Riano, Angelica Martinez
--   logistica  -> Mariana Gonzalez, Cristina Gomez

BEGIN;

CREATE TEMP TABLE tmp_causacion_members_2026_04_17 AS
WITH grupos AS (
  SELECT id, codigo
  FROM causacion_grupos
  WHERE codigo IN ('financiera', 'logistica')
),
miembros_objetivo AS (
  SELECT 'financiera'::varchar AS grupo_codigo, 'l.riano@prexxa.com.co'::varchar AS email, 'Causacion'::varchar AS cargo
  UNION ALL
  SELECT 'financiera', 'a.martinez@prexxa.com.co', 'Causacion'
  UNION ALL
  SELECT 'logistica', 'm.gonzalez@prexxa.com.co', 'Causacion'
  UNION ALL
  SELECT 'logistica', 'c.gomez@prexxa.com.co', 'Causacion'
)
SELECT
  g.id AS grupo_id,
  u.id AS user_id,
  m.cargo
FROM miembros_objetivo m
JOIN grupos g ON g.codigo = m.grupo_codigo
JOIN users u ON u.email = m.email;

UPDATE causacion_integrantes ci
SET
  activo = false,
  updated_at = CURRENT_TIMESTAMP
WHERE ci.grupo_id IN (
    SELECT id
    FROM causacion_grupos
    WHERE codigo IN ('financiera', 'logistica')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM tmp_causacion_members_2026_04_17 mr
    WHERE mr.grupo_id = ci.grupo_id
      AND mr.user_id = ci.user_id
  );

INSERT INTO causacion_integrantes (grupo_id, user_id, cargo, activo)
SELECT grupo_id, user_id, cargo, true
FROM tmp_causacion_members_2026_04_17
ON CONFLICT (grupo_id, user_id) DO UPDATE
SET
  cargo = EXCLUDED.cargo,
  activo = true,
  updated_at = CURRENT_TIMESTAMP;

DROP TABLE tmp_causacion_members_2026_04_17;

COMMIT;
