/**
 * Configuración de Base de Datos
 * Centraliza toda la configuración relacionada con PostgreSQL
 */

require('dotenv').config();
const { Pool } = require('pg');

/**
 * Configuración de la conexión a PostgreSQL
 */
const dbConfig = {
  host: process.env.DB_HOST || 'postgres-db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'firmas_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Máximo de conexiones en el pool
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
};

/**
 * Pool de conexiones a PostgreSQL
 */
const pool = new Pool(dbConfig);

/**
 * Evento de error del pool
 */
pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
  process.exit(-1);
});

/**
 * Verifica la conexión a la base de datos
 */
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Conexión a PostgreSQL exitosa:', result.rows[0].now);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    return false;
  }
}

/**
 * Cierra el pool de conexiones
 */
async function closePool() {
  try {
    await pool.end();
    console.log('🔒 Pool de conexiones cerrado');
  } catch (error) {
    console.error('❌ Error cerrando pool de conexiones:', error);
  }
}

/**
 * Ejecuta una query con manejo de errores
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`⚠️  Query lenta (${duration}ms):`, text);
    }

    return result;
  } catch (error) {
    console.error('❌ Error ejecutando query:', error.message);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Ejecuta una transacción
 */
async function transaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en transacción, haciendo rollback:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  closePool,
  dbConfig
};
