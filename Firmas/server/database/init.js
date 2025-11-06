const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Crear conexión a la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Inicializa la base de datos ejecutando el schema SQL
 */
async function initDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔄 Conectando a la base de datos...');

    // Leer el archivo schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📊 Ejecutando migraciones...');

    // Ejecutar el schema SQL
    await client.query(schemaSql);

    console.log('✅ Base de datos inicializada correctamente');
    console.log('\nTablas creadas:');
    console.log('  - users');
    console.log('  - documents');
    console.log('  - signatures');
    console.log('  - document_signers');
    console.log('  - audit_log');
    console.log('\nVistas creadas:');
    console.log('  - v_documents_with_signatures');
    console.log('  - v_pending_documents_by_user');

  } catch (error) {
    console.error('❌ Error al inicializar la base de datos:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('\n✨ Proceso completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = { initDatabase, pool };
