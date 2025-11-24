/**
 * Script para aplicar la migración de recordatorios
 * Ejecutar con: node server/scripts/apply-reminder-migration.js
 */

const { query } = require('../database/db');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  try {
    console.log('🔄 Aplicando migración de recordatorios...');

    // Leer el archivo SQL
    const migrationPath = path.join(__dirname, '../database/migrations/005_add_reminder_timestamp.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Ejecutar la migración
    await query(migrationSQL);

    console.log('✅ Migración aplicada exitosamente');
    console.log('✅ Columna last_reminder_sent_at agregada a la tabla signatures');
    console.log('✅ Índice idx_signatures_reminder_lookup creado');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error al aplicar migración:', error);
    process.exit(1);
  }
}

applyMigration();
