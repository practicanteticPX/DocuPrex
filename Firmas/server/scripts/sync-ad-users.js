/**
 * Script para sincronizar usuarios del Active Directory
 * Crea/actualiza usuarios en la base de datos desde AD
 */

require('dotenv').config();
// Usar la DATABASE_URL del .env si existe, si no, usar la configuración por defecto
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres123@postgres-db:5432/firmas_db';
}

const { query, pool } = require('../database/db');
const ldap = require('ldapjs');

const AD_CONFIG = {
  url: `${process.env.AD_PROTOCOL}://${process.env.AD_HOSTNAME}:${process.env.AD_PORT}`,
  bindDN: process.env.AD_BIND_USER,
  bindPassword: process.env.AD_BIND_PASS,
  baseDN: process.env.AD_BASE_DN,
  searchFilter: '(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))'
};

function connectToAD() {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: AD_CONFIG.url,
      timeout: 5000,
      connectTimeout: 10000,
      reconnect: false
    });

    client.bind(AD_CONFIG.bindDN, AD_CONFIG.bindPassword, (err) => {
      if (err) {
        reject(new Error(`Error de autenticación AD: ${err.message}`));
        return;
      }
      console.log('✓ Conectado al Active Directory');
      resolve(client);
    });
  });
}

function searchUsers(client) {
  return new Promise((resolve, reject) => {
    const opts = {
      filter: AD_CONFIG.searchFilter,
      scope: 'sub',
      attributes: ['cn', 'mail', 'sAMAccountName', 'displayName', 'name', 'userPrincipalName']
    };

    const users = [];

    client.search(AD_CONFIG.baseDN, opts, (err, res) => {
      if (err) {
        reject(err);
        return;
      }

      res.on('searchEntry', (entry) => {
        try {
          const user = entry.pojo || entry.object || {};

          // Extraer atributos
          const attrs = entry.attributes || [];
          const getAttr = (name) => {
            const attr = attrs.find(a => a.type === name);
            return attr?.values?.[0] || attr?.vals?.[0] || null;
          };

          const email = getAttr('mail') || getAttr('userPrincipalName') || null;
          const name = getAttr('displayName') || getAttr('cn') || getAttr('name') || null;
          const username = getAttr('sAMAccountName') || null;

          // Solo agregar si tiene datos mínimos Y email real
          if (name && username && email) {
            users.push({
              name: name,
              email: email.toLowerCase(),
              username: username
            });
          }
        } catch (err) {
          // Ignorar usuarios con errores
        }
      });

      res.on('error', (err) => {
        reject(err);
      });

      res.on('end', () => {
        resolve(users);
      });
    });
  });
}

async function syncUsersToDatabase(users) {
  console.log(`\n📥 Sincronizando ${users.length} usuarios a la base de datos...\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      // Verificar si el usuario ya existe
      const existing = await query(
        'SELECT id, name, email FROM users WHERE email = $1 OR ad_username = $2',
        [user.email, user.username]
      );

      if (existing.rows.length > 0) {
        // Actualizar usuario existente
        await query(
          'UPDATE users SET name = $1, email = $2, ad_username = $3 WHERE id = $4',
          [user.name, user.email, user.username, existing.rows[0].id]
        );
        console.log(`  ↻ Actualizado: ${user.name} (${user.email})`);
        updated++;
      } else {
        // Crear nuevo usuario
        await query(
          `INSERT INTO users (name, email, ad_username, role, is_active)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.name, user.email, user.username, 'user', true]
        );
        console.log(`  ✓ Creado: ${user.name} (${user.email})`);
        created++;
      }
    } catch (error) {
      console.log(`  ✗ Error con ${user.email}: ${error.message}`);
      console.error(`     Detalle: ${error.stack}`);
      skipped++;
    }
  }

  return { created, updated, skipped };
}

async function main() {
  console.log('========================================');
  console.log('  SINCRONIZACIÓN DE USUARIOS AD');
  console.log('========================================\n');

  let client = null;

  try {
    // Conectar al AD
    console.log('🔌 Conectando al Active Directory...');
    console.log(`   Host: ${process.env.AD_HOSTNAME}`);
    console.log(`   Base DN: ${process.env.AD_BASE_DN}\n`);

    client = await connectToAD();

    // Buscar usuarios
    console.log('🔍 Buscando usuarios en AD...');
    const users = await searchUsers(client);
    console.log(`✓ Encontrados ${users.length} usuarios\n`);

    if (users.length === 0) {
      console.log('⚠️  No se encontraron usuarios para sincronizar');
      return;
    }

    // Sincronizar a BD
    const stats = await syncUsersToDatabase(users);

    // Mostrar resumen
    console.log('\n========================================');
    console.log('  RESUMEN DE SINCRONIZACIÓN');
    console.log('========================================');
    console.log(`  ✓ Creados: ${stats.created}`);
    console.log(`  ↻ Actualizados: ${stats.updated}`);
    console.log(`  ✗ Omitidos: ${stats.skipped}`);
    console.log(`  📊 Total procesados: ${stats.created + stats.updated + stats.skipped}`);
    console.log('========================================\n');

    // Mostrar usuarios en BD
    const allUsers = await query('SELECT id, name, email, role FROM users ORDER BY name');
    console.log('Usuarios en la base de datos:');
    allUsers.rows.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.name} (${u.email}) - ${u.role}`);
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    // Cerrar conexiones
    if (client) {
      client.unbind();
    }
    await pool.end();
    process.exit(0);
  }
}

main();
