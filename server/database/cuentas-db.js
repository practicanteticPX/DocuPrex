const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Función auxiliar para crear configuración SSL
 * Estrategia: Intentar SSL con certificados → SSL sin certificados → Sin SSL
 */
function getSSLConfig() {
  const certsPath = path.join(__dirname, '../certs');
  const keyPath = path.join(certsPath, 'admin-key.pk8');
  const certPath = path.join(certsPath, 'admin-cert.pem');
  const caPath = path.join(certsPath, 'ca-cert.pem');

  // Verificar si todos los certificados existen
  if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(caPath)) {
    console.log('✅ Certificados SSL encontrados para DB_QPREX - intentando SSL con certificados');
    try {
      const sslConfig = {
        rejectUnauthorized: false, // Aceptar certificados self-signed
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        ca: fs.readFileSync(caPath)
      };

      console.log('🔍 Probando conexión SSL con certificados...');
      // Intentar crear un pool de prueba
      const testPool = new Pool({
        connectionString: process.env.CUENTAS_DATABASE_URL,
        max: 1,
        ssl: sslConfig
      });

      // Esperar un poco y cerrar
      setTimeout(() => testPool.end().catch(() => {}), 1000);

      console.log('✅ SSL con certificados parece viable - usando esta configuración');
      return sslConfig;

    } catch (error) {
      console.warn('⚠️  SSL con certificados falló:', error.message);
      console.warn('   Intentando SSL sin certificados...');
      return { rejectUnauthorized: false };
    }
  } else {
    console.warn('⚠️  Certificados SSL no encontrados - usando SSL sin certificados');
    return { rejectUnauthorized: false };
  }
}

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
  ssl: getSSLConfig()
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
