const { Pool } = require('pg');
require('dotenv').config();

// Configurar pool de conexiones para soportar 40+ usuarios concurrentes
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50, // Máximo de conexiones en el pool (suficiente para 40 usuarios + overhead)
  min: 10, // Mantener 10 conexiones mínimas abiertas
  idleTimeoutMillis: 30000, // Cerrar conexiones inactivas después de 30s
  connectionTimeoutMillis: 5000, // Timeout de 5s para establecer conexión
  allowExitOnIdle: false, // No cerrar el pool cuando no hay consultas activas
});

// Manejar errores del pool
pool.on('error', (err, client) => {
  console.error('Error inesperado en el cliente de PostgreSQL:', err);
  process.exit(-1);
});

/**
 * Ejecuta una query SQL
 * @param {string} text - Query SQL
 * @param {Array} params - Parámetros de la query
 * @returns {Promise} Resultado de la query
 */
const query = (text, params) => pool.query(text, params);

/**
 * Obtiene un cliente del pool para transacciones
 * @returns {Promise} Cliente de PostgreSQL
 */
const getClient = () => pool.connect();

module.exports = {
  query,
  getClient,
  pool,
};
