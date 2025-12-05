-- Script de ejemplo: Insertar integrantes de grupos de causación
-- Fecha: 2025-12-05
-- IMPORTANTE: Este es un archivo de EJEMPLO. Edite los nombres y correos reales antes de ejecutar.

-- ==================================================
-- INTEGRANTES DEL GRUPO FINANCIERA
-- ==================================================
INSERT INTO causacion_integrantes (grupo_id, nombre, email, cargo) VALUES
  -- Reemplazar con los integrantes reales del área financiera
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
    'Nombre Persona 1',
    'persona1@empresa.com',
    'Causación'
  ),
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
    'Nombre Persona 2',
    'persona2@empresa.com',
    'Causación'
  ),
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
    'Nombre Persona 3',
    'persona3@empresa.com',
    'Causación'
  )
ON CONFLICT (grupo_id, email) DO NOTHING;

-- ==================================================
-- INTEGRANTES DEL GRUPO LOGÍSTICA
-- ==================================================
INSERT INTO causacion_integrantes (grupo_id, nombre, email, cargo) VALUES
  -- Reemplazar con los integrantes reales del área de logística
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'logistica'),
    'Nombre Persona 4',
    'persona4@empresa.com',
    'Causación'
  ),
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'logistica'),
    'Nombre Persona 5',
    'persona5@empresa.com',
    'Causación'
  ),
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'logistica'),
    'Nombre Persona 6',
    'persona6@empresa.com',
    'Causación'
  )
ON CONFLICT (grupo_id, email) DO NOTHING;

-- ==================================================
-- VERIFICAR LOS DATOS INSERTADOS
-- ==================================================
-- Ejecutar estas consultas para verificar que los datos se insertaron correctamente:

-- Ver todos los grupos
-- SELECT * FROM causacion_grupos;

-- Ver todos los integrantes con el nombre de su grupo
-- SELECT
--   ci.id,
--   cg.nombre as grupo,
--   ci.nombre,
--   ci.email,
--   ci.cargo,
--   ci.activo
-- FROM causacion_integrantes ci
-- JOIN causacion_grupos cg ON ci.grupo_id = cg.id
-- ORDER BY cg.nombre, ci.nombre;
