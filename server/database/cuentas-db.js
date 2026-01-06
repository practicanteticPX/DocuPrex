const { Pool } = require('pg');
require('dotenv').config();

/**
 * Pool de conexiones para Base de Datos Externa DB_QPREX
 * Esquema: public
 * Tabla principal: T_Master_Responsable_Cuenta
 */
const cuentasPool = new Pool({
  connectionString: process.env.CUENTAS_DATABASE_URL,
  max: 20,
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false,
});

cuentasPool.on('error', (err, client) => {
  console.error('❌ Error inesperado en el pool de DB_QPREX (Cuentas):', err);
});

/**
 * Ejecuta una query SQL en el esquema public
 * @param {string} text - Query SQL
 * @param {Array} params - Parámetros de la query
 * @returns {Promise} Resultado de la query
 */
const queryCuentas = async (text, params) => {
  const start = Date.now();
  try {
    const result = await cuentasPool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`⚠️  Query lenta en DB_QPREX (${duration}ms):`, text);
    }

    return result;
  } catch (error) {
    console.error('❌ Error ejecutando query en DB_QPREX:', error.message);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
  }
};

/**
 * Ejecuta una transacción en el esquema public
 * @param {Function} callback - Función callback que recibe el cliente
 * @returns {Promise} Resultado de la transacción
 */
const transactionCuentas = async (callback) => {
  const client = await cuentasPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET search_path TO public');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en transacción DB_QPREX, haciendo rollback:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Verifica la conexión a DB_QPREX y el esquema public
 */
async function testConnectionCuentas() {
  try {
    const client = await cuentasPool.connect();
    await client.query('SET search_path TO public');
    const result = await client.query('SELECT NOW()');
    console.log('✅ Conexión a DB_QPREX (Cuentas) exitosa:', result.rows[0].now);

    const schemaCheck = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'public'
    `);

    if (schemaCheck.rows.length > 0) {
      console.log('✅ Esquema public encontrado');
    } else {
      console.warn('⚠️  Esquema public no encontrado');
    }

    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a DB_QPREX (Cuentas):', error.message);
    return false;
  }
}

/**
 * Cierra el pool de conexiones de cuentas
 */
async function closeCuentasPool() {
  try {
    await cuentasPool.end();
    console.log('🔒 Pool de conexiones DB_QPREX cerrado');
  } catch (error) {
    console.error('❌ Error cerrando pool de DB_QPREX:', error);
  }
}

module.exports = {
  cuentasPool,
  queryCuentas,
  transactionCuentas,
  testConnectionCuentas,
  closeCuentasPool,
};
