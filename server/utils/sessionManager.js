const crypto = require('crypto');
const { query } = require('../database/db');
const websocketService = require('../services/websocket');

/**
 * Session Manager - Gestión de sesiones de usuario con validación estricta de 8 horas
 *
 * REGLA DE ORO: La fuente de verdad para la expiración de sesión está en la base de datos,
 * NO en el token JWT. El JWT puede manipularse en el cliente, la BD es inmutable.
 *
 * FLUJO:
 * 1. Usuario hace login → Se registra login_time en BD
 * 2. Cada request → Se valida que no hayan pasado 8 horas desde login_time
 * 3. Si pasaron 8h → Sesión expirada OBLIGATORIAMENTE, sin excepciones
 */

const SESSION_DURATION_HOURS = 8;
const SESSION_DURATION_MS = SESSION_DURATION_HOURS * 60 * 60 * 1000;

/**
 * Genera un hash SHA-256 del token para almacenar en BD
 * No almacenamos el token completo por seguridad
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Registra una nueva sesión al hacer login
 * REGLA CRÍTICA: Solo puede existir UNA sesión activa por usuario
 * Todas las sesiones anteriores se cierran automáticamente
 *
 * @param {number} userId - ID del usuario
 * @param {string} token - JWT token generado
 * @param {string} ipAddress - IP del cliente
 * @param {string} userAgent - User agent del navegador
 * @returns {Promise<object>} Sesión creada
 */
async function createSession(userId, token, ipAddress = null, userAgent = null) {
  const tokenHash = hashToken(token);

  try {
    // PASO 1: Cerrar TODAS las sesiones anteriores del usuario (sesión única)
    const closedSessions = await query(`
      UPDATE user_sessions
      SET is_active = false, logout_time = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND is_active = true
      RETURNING id
    `, [userId]);

    if (closedSessions.rows.length > 0) {
      console.log(`🔓 Cerradas ${closedSessions.rows.length} sesiones anteriores del usuario ${userId} (sesión única)`);
    }

    // PASO 2: Crear la nueva sesión (única activa)
    const result = await query(`
      INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, login_time, is_active)
      VALUES ($1, $2, $3, $4, NOW(), true)
      RETURNING id, user_id, login_time, token_hash, is_active
    `, [userId, tokenHash, ipAddress, userAgent]);

    const session = result.rows[0];
    console.log(`🔐 Nueva sesión única creada: User ${userId}, Session ${session.id}, Login: ${session.login_time}`);

    // Emitir evento WebSocket para actualizar panel de sesiones en tiempo real
    websocketService.emitSessionsUpdated({ action: 'session_created', userId, sessionId: session.id });
    console.log(`📡 WebSocket: Enviado evento sessions:updated (session_created) para User ID ${userId}`);

    return session;
  } catch (error) {
    console.error('❌ Error creando sesión:', error);
    throw new Error('Error al crear sesión de usuario');
  }
}

/**
 * Valida si una sesión sigue activa y no ha expirado las 8 horas
 * REGLA ESTRICTA: Si han pasado 8 horas desde login_time, la sesión ES INVÁLIDA
 *
 * @param {string} token - JWT token
 * @returns {Promise<object|null>} Sesión válida o null si expiró
 */
async function validateSession(token) {
  const tokenHash = hashToken(token);

  try {
    // Buscar sesión activa con este token
    const result = await query(`
      SELECT
        id,
        user_id,
        login_time,
        is_active,
        EXTRACT(EPOCH FROM (NOW() - login_time)) / 3600 as hours_elapsed
      FROM user_sessions
      WHERE token_hash = $1 AND is_active = true
      LIMIT 1
    `, [tokenHash]);

    if (result.rows.length === 0) {
      console.warn('⚠️ Sesión no encontrada o ya cerrada');
      return null;
    }

    const session = result.rows[0];
    const hoursElapsed = parseFloat(session.hours_elapsed);

    // VALIDACIÓN ESTRICTA: Si han pasado 8 horas, sesión EXPIRADA
    if (hoursElapsed >= SESSION_DURATION_HOURS) {
      console.warn(`⏰ Sesión ${session.id} EXPIRADA: ${hoursElapsed.toFixed(2)}h desde login (máximo: ${SESSION_DURATION_HOURS}h)`);

      // Marcar sesión como inactiva
      await query(`
        UPDATE user_sessions
        SET is_active = false, logout_time = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [session.id]);

      return null;
    }

    // Sesión válida
    const remainingHours = SESSION_DURATION_HOURS - hoursElapsed;
    console.log(`✅ Sesión ${session.id} válida: ${hoursElapsed.toFixed(2)}h transcurridas, ${remainingHours.toFixed(2)}h restantes`);

    return session;
  } catch (error) {
    console.error('❌ Error validando sesión:', error);
    return null;
  }
}

/**
 * Cierra una sesión (logout)
 * @param {string} token - JWT token
 * @returns {Promise<boolean>} true si se cerró correctamente
 */
async function closeSession(token) {
  const tokenHash = hashToken(token);

  try {
    const result = await query(`
      UPDATE user_sessions
      SET is_active = false, logout_time = NOW(), updated_at = NOW()
      WHERE token_hash = $1 AND is_active = true
      RETURNING id, user_id
    `, [tokenHash]);

    if (result.rows.length > 0) {
      const session = result.rows[0];
      console.log(`🔓 Sesión cerrada: User ${session.user_id}, Session ${session.id}`);

      // Emitir evento WebSocket para actualizar panel de sesiones en tiempo real
      websocketService.emitSessionsUpdated({
        action: 'session_closed',
        userId: session.user_id,
        sessionId: session.id
      });
      console.log(`📡 WebSocket: Enviado evento sessions:updated (logout normal) para User ID ${session.user_id}`);

      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Error cerrando sesión:', error);
    return false;
  }
}

/**
 * Cierra todas las sesiones activas de un usuario (logout from all devices)
 * @param {number} userId - ID del usuario
 * @returns {Promise<number>} Cantidad de sesiones cerradas
 */
async function closeAllUserSessions(userId) {
  try {
    const result = await query(`
      UPDATE user_sessions
      SET is_active = false, logout_time = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND is_active = true
      RETURNING id
    `, [userId]);

    const count = result.rows.length;
    console.log(`🔓 Cerradas ${count} sesiones del usuario ${userId}`);

    return count;
  } catch (error) {
    console.error('❌ Error cerrando todas las sesiones:', error);
    return 0;
  }
}

/**
 * Limpia sesiones expiradas (cron job para ejecutar periódicamente)
 * Marca como inactivas todas las sesiones que hayan pasado más de 8 horas
 * @returns {Promise<number>} Cantidad de sesiones expiradas
 */
async function cleanupExpiredSessions() {
  try {
    const result = await query(`
      UPDATE user_sessions
      SET is_active = false, logout_time = NOW(), updated_at = NOW()
      WHERE is_active = true
        AND EXTRACT(EPOCH FROM (NOW() - login_time)) / 3600 >= $1
      RETURNING id, user_id, login_time
    `, [SESSION_DURATION_HOURS]);

    const count = result.rows.length;
    if (count > 0) {
      console.log(`🧹 Limpiadas ${count} sesiones expiradas (>8h)`);
      result.rows.forEach(session => {
        console.log(`   - Session ${session.id}, User ${session.user_id}, Login: ${session.login_time}`);
      });
    }

    return count;
  } catch (error) {
    console.error('❌ Error limpiando sesiones expiradas:', error);
    return 0;
  }
}

/**
 * Obtiene sesiones activas de un usuario
 * @param {number} userId - ID del usuario
 * @returns {Promise<Array>} Lista de sesiones activas
 */
async function getUserActiveSessions(userId) {
  try {
    const result = await query(`
      SELECT
        id,
        login_time,
        ip_address,
        user_agent,
        EXTRACT(EPOCH FROM (NOW() - login_time)) / 3600 as hours_elapsed
      FROM user_sessions
      WHERE user_id = $1 AND is_active = true
      ORDER BY login_time DESC
    `, [userId]);

    return result.rows;
  } catch (error) {
    console.error('❌ Error obteniendo sesiones activas:', error);
    return [];
  }
}

module.exports = {
  createSession,
  validateSession,
  closeSession,
  closeAllUserSessions,
  cleanupExpiredSessions,
  getUserActiveSessions,
  SESSION_DURATION_HOURS
};
