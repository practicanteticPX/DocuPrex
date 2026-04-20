const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('🔧 facturas-db startup env:', {
  FACTURAS_DATABASE_URL: process.env.FACTURAS_DATABASE_URL,
  PGSSLMODE: process.env.PGSSLMODE,
  PGSSLROOTCERT: process.env.PGSSLROOTCERT,
  NODE_ENV: process.env.NODE_ENV
});

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
    console.log('✅ Certificados SSL encontrados para SERV_QPREX - intentando SSL con certificados');
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
        connectionString: process.env.FACTURAS_DATABASE_URL,
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
 * Pool de conexiones para Base de Datos Externa SERV_QPREX
 * Esquema: crud_facturas
 * Tabla principal: T_Facturas
 */
const facturasPool = new Pool({
  connectionString: process.env.FACTURAS_DATABASE_URL,
  max: 20,
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false,
  ssl: getSSLConfig()
});

facturasPool.on('error', (err, client) => {
  console.error('❌ Error inesperado en el pool de SERV_QPREX (Facturas):', err);
});

/**
 * Ejecuta una query SQL en el esquema crud_facturas
 * @param {string} text - Query SQL
 * @param {Array} params - Parámetros de la query
 * @returns {Promise} Resultado de la query
 */
const queryFacturas = async (text, params) => {
  const start = Date.now();
  try {
    const result = await facturasPool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`⚠️  Query lenta en SERV_QPREX (${duration}ms):`, text);
    }

    return result;
  } catch (error) {
    console.error('❌ Error ejecutando query en SERV_QPREX:', error.message);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
  }
};

/**
 * Ejecuta una transacción en el esquema crud_facturas
 * @param {Function} callback - Función callback que recibe el cliente
 * @returns {Promise} Resultado de la transacción
 */
const transactionFacturas = async (callback) => {
  const client = await facturasPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET search_path TO crud_facturas');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en transacción SERV_QPREX, haciendo rollback:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Verifica la conexión a SERV_QPREX y el esquema crud_facturas
 */
async function testConnectionFacturas() {
  try {
    const client = await facturasPool.connect();
    await client.query('SET search_path TO crud_facturas');
    const result = await client.query('SELECT NOW()');
    console.log('✅ Conexión a SERV_QPREX (Facturas) exitosa:', result.rows[0].now);

    const schemaCheck = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'crud_facturas'
    `);

    if (schemaCheck.rows.length > 0) {
      console.log('✅ Esquema crud_facturas encontrado');
    } else {
      console.warn('⚠️  Esquema crud_facturas no encontrado');
    }

    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a SERV_QPREX (Facturas):', error.message);
    return false;
  }
}

/**
 * Cierra el pool de conexiones de facturas
 */
async function closeFacturasPool() {
  try {
    await facturasPool.end();
    console.log('🔒 Pool de conexiones SERV_QPREX cerrado');
  } catch (error) {
    console.error('❌ Error cerrando pool de SERV_QPREX:', error);
  }
}

module.exports = {
  facturasPool,
  queryFacturas,
  transactionFacturas,
  testConnectionFacturas,
  closeFacturasPool,
};
