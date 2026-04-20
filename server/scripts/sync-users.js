require('dotenv').config();
const { getAllUsers } = require('../services/ldap');
const { Pool } = require('pg');

// Configuración de la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Sincroniza usuarios desde Active Directory con la base de datos
 */
async function syncUsers() {
  console.log('🚀 Iniciando sincronización de usuarios desde Active Directory...\n');

  try {
    // Obtener usuarios de AD
    console.log('🔍 Obteniendo usuarios de Active Directory...');
    const adUsers = await getAllUsers();
    console.log(`✅ Encontrados ${adUsers.length} usuarios en AD\n`);

    // Conectar a la base de datos
    const client = await pool.connect();

    try {
      // Iniciar transacción
      await client.query('BEGIN');

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      for (const adUser of adUsers) {
        // Verificar si el usuario ya existe
        const existingUser = await client.query(
          'SELECT id, name, email, ad_username FROM users WHERE ad_username = $1 OR email = $2',
          [adUser.username, adUser.email]
        );

        if (existingUser.rows.length > 0) {
          // Usuario existe, actualizar información
          const existing = existingUser.rows[0];
          await client.query(`
            UPDATE users
            SET name = $1, email = $2, ad_username = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
          `, [adUser.name, adUser.email, adUser.username, existing.id]);

          console.log(`📝 Actualizado: ${adUser.name} (${adUser.email})`);
          updated++;
        } else {
          // Usuario nuevo, insertar
          await client.query(`
            INSERT INTO users (name, email, ad_username, role, is_active, email_notifications)
            VALUES ($1, $2, $3, 'user', true, true)
          `, [adUser.name, adUser.email, adUser.username]);

          console.log(`➕ Insertado: ${adUser.name} (${adUser.email})`);
          inserted++;
        }
      }

      // Confirmar transacción
      await client.query('COMMIT');

      console.log(`\n✅ Sincronización completada:`);
      console.log(`   ➕ Nuevos usuarios: ${inserted}`);
      console.log(`   📝 Usuarios actualizados: ${updated}`);
      console.log(`   ⏭️  Usuarios omitidos: ${skipped}`);

      // Mostrar resumen de usuarios en BD
      const totalUsers = await client.query('SELECT COUNT(*) as count FROM users WHERE email != \'admin@prexxa.local\'');
      console.log(`\n📊 Total de usuarios en base de datos: ${totalUsers.rows[0].count}`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Error durante la sincronización:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Ejecutar sincronización si se llama directamente
if (require.main === module) {
  syncUsers()
    .then(() => {
      console.log('\n🎉 Sincronización finalizada exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = { syncUsers };