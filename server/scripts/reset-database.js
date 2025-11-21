/**
 * Script para RESETEAR COMPLETAMENTE la base de datos
 *
 * ⚠️ ADVERTENCIA: Este script ELIMINARÁ TODOS LOS DATOS
 * - Usuarios
 * - Documentos y archivos
 * - Firmas
 * - Notificaciones
 * - Logs de auditoría
 * - TODO
 *
 * Uso:
 *   node scripts/reset-database.js
 */

require('dotenv').config();
const { query, pool } = require('../database/db');
const fs = require('fs');
const path = require('path');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function confirmAction() {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question(
      `${colors.red}⚠️  ¿Estás SEGURO de que quieres ELIMINAR TODOS LOS DATOS? (escribe 'SI' para confirmar): ${colors.reset}`,
      (answer) => {
        readline.close();
        resolve(answer === 'SI');
      }
    );
  });
}

async function deleteAllFiles() {
  log('\n🗑️  Eliminando archivos subidos...', 'yellow');

  const uploadsDir = path.join(__dirname, '..', 'uploads');

  if (!fs.existsSync(uploadsDir)) {
    log('✓ No hay carpeta de uploads', 'green');
    return;
  }

  try {
    const files = fs.readdirSync(uploadsDir);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    log(`✓ ${deletedCount} archivos eliminados`, 'green');
  } catch (error) {
    log(`✗ Error al eliminar archivos: ${error.message}`, 'red');
    throw error;
  }
}

async function truncateTables() {
  log('\n🗄️  Eliminando todos los registros de la base de datos...', 'yellow');

  const tables = [
    'notifications',
    'signatures',
    'document_signers',
    'documents',
    'users'
  ];

  try {
    // Deshabilitar foreign keys temporalmente
    await query('SET session_replication_role = replica;');

    for (const table of tables) {
      await query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);
      log(`  ✓ Tabla '${table}' limpiada`, 'cyan');
    }

    // Rehabilitar foreign keys
    await query('SET session_replication_role = DEFAULT;');

    log('✓ Todas las tablas han sido limpiadas', 'green');
  } catch (error) {
    log(`✗ Error al limpiar tablas: ${error.message}`, 'red');
    throw error;
  }
}

async function createAdminUser() {
  log('\n👤 Creando usuario administrador...', 'yellow');

  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash('admin123', 10);

  try {
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role`,
      ['Administrador', 'admin@prexxa.local', hashedPassword, 'admin', true]
    );

    const admin = result.rows[0];
    log(`✓ Usuario administrador creado:`, 'green');
    log(`  - Email: ${admin.email}`, 'cyan');
    log(`  - Contraseña: admin123`, 'cyan');
    log(`  - Rol: ${admin.role}`, 'cyan');

    return admin;
  } catch (error) {
    log(`✗ Error al crear administrador: ${error.message}`, 'red');
    throw error;
  }
}

async function showStatistics() {
  log('\n📊 Verificando estado de la base de datos...', 'yellow');

  try {
    const tables = ['users', 'documents', 'signatures', 'notifications'];

    for (const table of tables) {
      const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = result.rows[0].count;
      log(`  ${table}: ${count} registros`, 'cyan');
    }

    log('✓ Base de datos verificada', 'green');
  } catch (error) {
    log(`✗ Error al verificar estadísticas: ${error.message}`, 'red');
  }
}

async function main() {
  log('\n========================================', 'magenta');
  log('  RESETEO COMPLETO DE BASE DE DATOS', 'magenta');
  log('========================================\n', 'magenta');

  log('Este script va a:', 'yellow');
  log('  1. Eliminar TODOS los archivos subidos', 'red');
  log('  2. Eliminar TODOS los registros de la base de datos', 'red');
  log('  3. Crear un usuario administrador nuevo', 'green');
  log('');

  // Confirmar acción
  const confirmed = await confirmAction();

  if (!confirmed) {
    log('\n❌ Operación cancelada', 'yellow');
    process.exit(0);
  }

  try {
    log('\n🚀 Iniciando reseteo...', 'blue');

    // Paso 1: Eliminar archivos
    await deleteAllFiles();

    // Paso 2: Limpiar base de datos
    await truncateTables();

    // Paso 3: Crear admin
    await createAdminUser();

    // Paso 4: Mostrar estadísticas
    await showStatistics();

    log('\n========================================', 'green');
    log('  ✓ RESETEO COMPLETADO EXITOSAMENTE', 'green');
    log('========================================\n', 'green');

    log('Puedes iniciar sesión con:', 'cyan');
    log('  Email: admin@prexxa.local', 'cyan');
    log('  Contraseña: admin123', 'cyan');
    log('');

  } catch (error) {
    log('\n========================================', 'red');
    log('  ✗ ERROR DURANTE EL RESETEO', 'red');
    log('========================================\n', 'red');
    log(error.message, 'red');
    log(error.stack, 'red');
    process.exit(1);
  } finally {
    // Cerrar pool de conexiones
    await pool.end();
    process.exit(0);
  }
}

// Ejecutar
main();
