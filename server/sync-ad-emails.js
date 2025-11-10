/**
 * Script para sincronizar emails desde Active Directory a la base de datos
 *
 * Este script:
 * 1. Busca todos los usuarios en Active Directory
 * 2. Compara con los usuarios en la base de datos
 * 3. Actualiza los emails si hay diferencias
 *
 * Uso:
 *   node sync-ad-emails.js
 *
 * O dentro del contenedor Docker:
 *   docker-compose exec server node sync-ad-emails.js
 */

require('dotenv').config();
const ldap = require('ldapjs');
const { query } = require('./database/db');

const {
  AD_PROTOCOL = 'ldap',
  AD_HOSTNAME,
  AD_PORT = '389',
  AD_BASE_DN,
  AD_SEARCH_BASE,
  AD_BIND_USER,
  AD_BIND_PASS,
  AD_USER_SEARCH_FILTER
} = process.env;

function createLdapClient() {
  return ldap.createClient({
    url: `${AD_PROTOCOL}://${AD_HOSTNAME}:${AD_PORT}`,
    timeout: 10000,
    connectTimeout: 10000
  });
}

async function bindAsService(client) {
  return new Promise((resolve, reject) =>
    client.bind(AD_BIND_USER, AD_BIND_PASS, err => {
      if (err) return reject(err);
      resolve();
    })
  );
}

async function unbindSafe(client) {
  return new Promise(res => client.unbind(() => res()));
}

async function searchAllUsers() {
  const client = createLdapClient();

  try {
    console.log('🔑 Conectando a Active Directory...');
    await bindAsService(client);
    console.log('✅ Conectado exitosamente\n');

    const filter = AD_USER_SEARCH_FILTER || '(&(objectCategory=person)(objectClass=user))';
    const searchBase = AD_SEARCH_BASE || AD_BASE_DN;

    console.log(`🔍 Buscando usuarios en: ${searchBase}`);
    console.log(`🔍 Filtro: ${filter}\n`);

    const opts = {
      scope: 'sub',
      filter: filter,
      attributes: [
        'sAMAccountName',
        'displayName',
        'cn',
        'mail',
        'userPrincipalName',
        'employeeID',
        'proxyAddresses'
      ]
    };

    const entries = await new Promise((resolve, reject) => {
      const list = [];
      client.search(searchBase, opts, (err, res) => {
        if (err) return reject(err);

        res.on('searchEntry', e => {
          const entry = {
            dn: String(e.objectName)
          };

          if (e.attributes) {
            e.attributes.forEach(attr => {
              const name = attr.type || attr.name;
              const values = attr.values || attr.vals || [];
              const processedValues = values.map(v =>
                Buffer.isBuffer(v) ? v.toString('utf8') : String(v)
              );
              entry[name] = processedValues.length === 1 ? processedValues[0] : processedValues;
            });
          }

          list.push(entry);
        });

        res.on('error', reject);
        res.on('end', () => resolve(list));
      });
    });

    console.log(`📊 Total de usuarios encontrados en AD: ${entries.length}\n`);
    return entries;
  } finally {
    await unbindSafe(client);
  }
}

async function syncEmailsFromAD() {
  console.log('🔄 Iniciando sincronización de emails desde Active Directory...\n');

  try {
    // Obtener usuarios de AD
    const adUsers = await searchAllUsers();

    // Obtener usuarios de la BD
    const dbResult = await query('SELECT id, name, ad_username, email FROM users WHERE ad_username IS NOT NULL');
    const dbUsers = dbResult.rows;

    console.log('📋 Usuarios en la base de datos:');
    console.log('─────────────────────────────────────────────────────────────────\n');

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const dbUser of dbUsers) {
      const adUser = adUsers.find(u => u.sAMAccountName === dbUser.ad_username);

      console.log(`👤 ${dbUser.name} (${dbUser.ad_username})`);
      console.log(`   📧 Email actual en BD: ${dbUser.email}`);

      if (!adUser) {
        console.log(`   ⚠️  No encontrado en Active Directory`);
        notFound++;
        console.log('');
        continue;
      }

      // Prioridad: mail > userPrincipalName > proxyAddresses (SMTP primario)
      let adEmail = null;

      if (adUser.mail) {
        adEmail = adUser.mail;
        console.log(`   ✅ Campo 'mail' en AD: ${adEmail}`);
      } else if (adUser.userPrincipalName) {
        adEmail = adUser.userPrincipalName;
        console.log(`   📝 Campo 'userPrincipalName' en AD: ${adEmail}`);
      } else if (adUser.proxyAddresses) {
        // Buscar el SMTP primario (con mayúsculas) en proxyAddresses
        const addresses = Array.isArray(adUser.proxyAddresses) ? adUser.proxyAddresses : [adUser.proxyAddresses];
        const primary = addresses.find(addr => addr.startsWith('SMTP:'));
        if (primary) {
          adEmail = primary.replace('SMTP:', '');
          console.log(`   📮 proxyAddresses (SMTP primario): ${adEmail}`);
        }
      }

      if (!adEmail) {
        console.log(`   ❌ No se encontró email en Active Directory`);
        console.log(`   ℹ️  Campos disponibles en AD:`, {
          mail: adUser.mail || 'N/A',
          userPrincipalName: adUser.userPrincipalName || 'N/A',
          proxyAddresses: adUser.proxyAddresses || 'N/A'
        });
        skipped++;
        console.log('');
        continue;
      }

      // Verificar si necesita actualización
      if (dbUser.email !== adEmail) {
        console.log(`   🔄 Actualizando email a: ${adEmail}`);
        await query(
          'UPDATE users SET email = $1 WHERE id = $2',
          [adEmail, dbUser.id]
        );
        updated++;
      } else {
        console.log(`   ✓ Email ya está actualizado`);
        skipped++;
      }

      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 Resumen de sincronización:');
    console.log(`   ✅ Actualizados: ${updated}`);
    console.log(`   ⏭️  Sin cambios: ${skipped}`);
    console.log(`   ⚠️  No encontrados en AD: ${notFound}`);
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error durante sincronización:', error.message);
    throw error;
  }
}

// Ejecutar sincronización
syncEmailsFromAD()
  .then(() => {
    console.log('\n✅ Sincronización completada');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });
