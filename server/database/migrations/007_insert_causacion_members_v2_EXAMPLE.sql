-- Script de ejemplo: Insertar integrantes de grupos de causación (Versión 2)
-- Fecha: 2025-12-05
-- IMPORTANTE: Los usuarios deben existir en la tabla 'users' antes de agregarlos

-- ==================================================
-- VER USUARIOS DISPONIBLES EN EL SISTEMA
-- ==================================================
-- Ejecuta esta consulta primero para ver qué usuarios puedes agregar:
-- SELECT id, name, email FROM users WHERE is_active = true ORDER BY name;

-- ==================================================
-- INTEGRANTES DEL GRUPO FINANCIERA
-- ==================================================
-- Ejemplo: Agregar usuarios al grupo Financiera
INSERT INTO causacion_integrantes (grupo_id, user_id, cargo) VALUES
  -- Reemplazar 'CORREO_USUARIO' con el email real del usuario
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
    (SELECT id FROM users WHERE email = 'm.bustamante@prexxa.com.co'),
    'Causación'
  ),
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
    (SELECT id FROM users WHERE email = 'm.rendon@prexxa.com.co'),
    'Causación'
  ),
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
    (SELECT id FROM users WHERE email = 'c.martinez@prexxa.com.co'),
    'Causación'
  )
ON CONFLICT (grupo_id, user_id) DO NOTHING;

-- ==================================================
-- INTEGRANTES DEL GRUPO LOGÍSTICA
-- ==================================================
-- Ejemplo: Agregar usuarios al grupo Logística
INSERT INTO causacion_integrantes (grupo_id, user_id, cargo) VALUES
  -- Reemplazar 'CORREO_USUARIO' con el email real del usuario
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'logistica'),
    (SELECT id FROM users WHERE email = 'juan.duque@prexxa.com.co'),
    'Causación'
  ),
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'logistica'),
    (SELECT id FROM users WHERE email = 'j.david@prexxa.com.co'),
    'Causación'
  ),
  (
    (SELECT id FROM causacion_grupos WHERE codigo = 'logistica'),
    (SELECT id FROM users WHERE email = 'r.gil@prexxa.com.co'),
    'Causación'
  )
ON CONFLICT (grupo_id, user_id) DO NOTHING;

-- ==================================================
-- VERIFICAR LOS DATOS INSERTADOS
-- ==================================================
-- Ejecutar estas consultas para verificar que los datos se insertaron correctamente:

-- Ver todos los grupos
-- SELECT * FROM causacion_grupos;

-- Ver todos los integrantes con sus datos completos
SELECT
  cg.nombre as grupo,
  u.name as nombre_usuario,
  u.email as email_usuario,
  ci.cargo,
  ci.activo
FROM causacion_integrantes ci
JOIN causacion_grupos cg ON ci.grupo_id = cg.id
JOIN users u ON ci.user_id = u.id
ORDER BY cg.nombre, u.name;

-- ==================================================
-- AGREGAR UN USUARIO DE FORMA INDIVIDUAL
-- ==================================================
-- Ejemplo para agregar un usuario específico al grupo Financiera:
-- INSERT INTO causacion_integrantes (grupo_id, user_id, cargo)
-- VALUES (
--   (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
--   (SELECT id FROM users WHERE email = 'usuario@empresa.com'),
--   'Causación'
-- )
-- ON CONFLICT (grupo_id, user_id) DO NOTHING;

-- ==================================================
-- ELIMINAR UN USUARIO DE UN GRUPO
-- ==================================================
-- Para desactivar (no eliminar):
-- UPDATE causacion_integrantes
-- SET activo = false
-- WHERE user_id = (SELECT id FROM users WHERE email = 'usuario@empresa.com')
--   AND grupo_id = (SELECT id FROM causacion_grupos WHERE codigo = 'financiera');

-- Para eliminar completamente:
-- DELETE FROM causacion_integrantes
-- WHERE user_id = (SELECT id FROM users WHERE email = 'usuario@empresa.com')
--   AND grupo_id = (SELECT id FROM causacion_grupos WHERE codigo = 'financiera');
