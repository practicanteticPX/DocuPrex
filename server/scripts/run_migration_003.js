const { query } = require('../database/db');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  try {
    console.log('🔄 Ejecutando migración 003: add_metadata_column...\n');

    const migrationPath = path.join(__dirname, '../database/migrations/003_add_metadata_column.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');

    console.log('📋 SQL a ejecutar:');
    console.log(sql);
    console.log('\n');

    const result = await query(sql);

    console.log('✅ Migración ejecutada exitosamente\n');
    console.log('Resultado:', result);

    const checkResult = await query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'documents' AND column_name = 'metadata'`
    );

    if (checkResult.rows.length > 0) {
      console.log('\n✅ Columna metadata creada correctamente:');
      console.log(checkResult.rows[0]);
    } else {
      console.log('\n⚠️ La columna metadata no se encontró después de la migración');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error al ejecutar migración:', error);
    process.exit(1);
  }
}

runMigration();
