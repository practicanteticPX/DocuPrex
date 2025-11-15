/**
 * Queries SQL para la tabla users
 * Centraliza todas las consultas relacionadas con usuarios
 */

/**
 * Obtiene un usuario por ID
 */
const getUserById = `
  SELECT *
  FROM users
  WHERE id = $1
`;

/**
 * Obtiene un usuario por email
 */
const getUserByEmail = `
  SELECT *
  FROM users
  WHERE email = $1
`;

/**
 * Obtiene un usuario por username de AD
 */
const getUserByAdUsername = `
  SELECT *
  FROM users
  WHERE ad_username = $1
`;

/**
 * Obtiene todos los usuarios ordenados por fecha de creación
 */
const getAllUsers = `
  SELECT *
  FROM users
  ORDER BY created_at DESC
`;

/**
 * Obtiene usuarios por rol
 */
const getUsersByRole = `
  SELECT *
  FROM users
  WHERE role = $1
  ORDER BY name ASC
`;

/**
 * Busca usuarios por nombre o email
 */
const searchUsers = `
  SELECT *
  FROM users
  WHERE
    name ILIKE $1
    OR email ILIKE $1
  ORDER BY name ASC
  LIMIT 50
`;

/**
 * Crea un nuevo usuario
 */
const createUser = `
  INSERT INTO users (name, email, password_hash, role, ad_username, email_notifications)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *
`;

/**
 * Actualiza un usuario
 */
const updateUser = `
  UPDATE users
  SET
    name = COALESCE($2, name),
    email = COALESCE($3, email),
    role = COALESCE($4, role),
    ad_username = COALESCE($5, ad_username),
    email_notifications = COALESCE($6, email_notifications)
  WHERE id = $1
  RETURNING *
`;

/**
 * Actualiza la contraseña de un usuario
 */
const updateUserPassword = `
  UPDATE users
  SET password_hash = $2
  WHERE id = $1
  RETURNING *
`;

/**
 * Actualiza las preferencias de notificaciones por email
 */
const updateEmailNotifications = `
  UPDATE users
  SET email_notifications = $2
  WHERE id = $1
  RETURNING *
`;

/**
 * Elimina un usuario
 */
const deleteUser = `
  DELETE FROM users
  WHERE id = $1
  RETURNING *
`;

/**
 * Verifica si un email ya existe
 */
const checkEmailExists = `
  SELECT EXISTS(
    SELECT 1
    FROM users
    WHERE email = $1
  ) as exists
`;

/**
 * Verifica si un username de AD ya existe
 */
const checkAdUsernameExists = `
  SELECT EXISTS(
    SELECT 1
    FROM users
    WHERE ad_username = $1
  ) as exists
`;

/**
 * Obtiene el conteo total de usuarios
 */
const getUserCount = `
  SELECT COUNT(*) as count
  FROM users
`;

/**
 * Obtiene el conteo de usuarios por rol
 */
const getUserCountByRole = `
  SELECT
    role,
    COUNT(*) as count
  FROM users
  GROUP BY role
  ORDER BY role
`;

/**
 * Obtiene usuarios activos (que han firmado o subido documentos)
 */
const getActiveUsers = `
  SELECT DISTINCT u.*
  FROM users u
  LEFT JOIN documents d ON u.id = d.uploaded_by
  LEFT JOIN signatures s ON u.id = s.signer_id
  WHERE d.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY u.name ASC
`;

/**
 * Obtiene el último login de un usuario (si existe tabla de logs)
 */
const getLastLogin = `
  SELECT
    user_id,
    MAX(created_at) as last_login
  FROM audit_log
  WHERE action = 'login' AND user_id = $1
  GROUP BY user_id
`;

module.exports = {
  getUserById,
  getUserByEmail,
  getUserByAdUsername,
  getAllUsers,
  getUsersByRole,
  searchUsers,
  createUser,
  updateUser,
  updateUserPassword,
  updateEmailNotifications,
  deleteUser,
  checkEmailExists,
  checkAdUsernameExists,
  getUserCount,
  getUserCountByRole,
  getActiveUsers,
  getLastLogin
};
