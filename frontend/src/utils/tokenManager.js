/**
 * Token Manager - Gestión de JWT y expiración de sesión
 * Maneja la validación y auto-logout cuando el token expira
 */

/**
 * Decodifica un JWT sin librerías externas
 * @param {string} token - JWT token
 * @returns {object|null} Payload decodificado o null si es inválido
 */
export const decodeJWT = (token) => {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error decodificando JWT:', error);
    return null;
  }
};

/**
 * Verifica si un token está expirado
 * @param {string} token - JWT token
 * @returns {boolean} true si está expirado, false si aún es válido
 */
export const isTokenExpired = (token) => {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return true;

  const now = Math.floor(Date.now() / 1000); // Timestamp actual en segundos
  return decoded.exp < now;
};

/**
 * Obtiene el tiempo restante hasta que expire el token (en segundos)
 * @param {string} token - JWT token
 * @returns {number} Segundos restantes, o 0 si ya expiró
 */
export const getTokenTimeRemaining = (token) => {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return 0;

  const now = Math.floor(Date.now() / 1000);
  const remaining = decoded.exp - now;
  return remaining > 0 ? remaining : 0;
};

/**
 * Obtiene la fecha de expiración del token
 * @param {string} token - JWT token
 * @returns {Date|null} Fecha de expiración o null
 */
export const getTokenExpirationDate = (token) => {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return null;

  return new Date(decoded.exp * 1000);
};
