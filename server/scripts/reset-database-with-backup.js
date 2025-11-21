/**
 * Script para RESETEAR la base de datos con BACKUP previo
 *
 * ⚠️ Este script:
 * 1. Crea un backup de la base de datos
 * 2. Elimina todos los datos
 * 3. Crea usuario administrador
 *
 * Uso:
 *   node scripts/reset-database-with-backup.js
 */

require('dotenv').config();
const { query, pool } = require('../database/db');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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
      `${colors.yellow}¿Deseas crear un BACKUP antes de limpiar? (S/N): ${colors.reset}`,
      (answer) => {
        readline.close();
        resolve(answer.toUpperCase() === 'S');
      }
    );
  });
}

async function createBackup() {
  log('\n💾 Creando backup de la base de datos...', 'yellow');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const backupDir = path.join(__dirname, '..', 'backups');
  const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

  // Crear directorio de backups si no existe
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  try {
    // Parsear DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    const urlMatch = dbUrl.match(/postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);

    if (!urlMatch) {
      throw new Error('No se pudo parsear DATABASE_URL');
    }

    const [, user, password, host, port, database] = urlMatch;

    // Configurar PGPASSWORD para pg_dump
    const env = { ...process.env, PGPASSWORD: password };

    // Ejecutar pg_dump
    const command = `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} -F p -f "${backupFile}"`;

    await execPromise(command, { env });

    const stats = fs.statSync(backupFile);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    log(`✓ Backup creado exitosamente`, 'green');
    log(`  Ubicación: ${backupFile}`, 'cyan');
    log(`  Tamaño: ${sizeInMB} MB`, 'cyan');

    return backupFile;
  } catch (error) {
    log(`✗ Error al crear backup: ${error.message}`, 'red');
    log('  Continuando sin backup...', 'yellow');
    return null;
  }
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
  }
}

async function truncateTables() {
  log('\n🗄️  Limpiando base de datos...', 'yellow');

  try {
    await query('SET session_replication_role = replica;');

    const tables = ['notifications', 'signatures', 'document_signers', 'documents', 'users'];

    for (const table of tables) {
      await query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);
      log(`  ✓ ${table}`, 'cyan');
    }

    await query('SET session_replication_role = DEFAULT;');

    log('✓ Base de datos limpiada', 'green');
  } catch (error) {
    log(`✗ Error: ${error.message}`, 'red');
    throw error;
  }
}

async function createAdminUser() {
  log('\n👤 Creando usuario administrador...', 'yellow');

  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash('admin123', 10);

  try {
    await query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Administrador', 'admin@prexxa.local', hashedPassword, 'admin', true]
    );

    log('✓ Administrador creado', 'green');
    log('  Email: admin@prexxa.local', 'cyan');
    log('  Contraseña: admin123', 'cyan');
  } catch (error) {
    log(`✗ Error: ${error.message}`, 'red');
    throw error;
  }
}

async function main() {
  log('\n========================================', 'blue');
  log('  RESETEO DE BASE DE DATOS', 'blue');
  log('========================================\n', 'blue');

  try {
    // Confirmar si quiere backup
    const wantsBackup = await confirmAction();
    let backupFile = null;

    if (wantsBackup) {
      backupFile = await createBackup();
    }

    // Ejecutar limpieza
    await deleteAllFiles();
    await truncateTables();
    await createAdminUser();

    log('\n========================================', 'green');
    log('  ✓ RESETEO COMPLETADO', 'green');
    log('========================================\n', 'green');

    if (backupFile) {
      log('Backup guardado en:', 'cyan');
      log(`  ${backupFile}\n`, 'cyan');
    }

    log('Credenciales de acceso:', 'cyan');
    log('  admin@prexxa.local / admin123\n', 'cyan');

  } catch (error) {
    log('\n✗ ERROR:', 'red');
    log(error.message, 'red');
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
