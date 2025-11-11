const ldap = require('ldapjs');
const { Pool } = require('pg');
require('dotenv').config();

// Configuración Active Directory
const {
  AD_PROTOCOL = 'ldap',
  AD_HOSTNAME,
  AD_PORT = '389',
  AD_BASE_DN,
  AD_SEARCH_BASE,
  AD_BIND_USER,
  AD_BIND_PASS,
  DATABASE_URL
} = process.env;

/**
 * Construye la URL del servidor LDAP
 */
function ldapUrl() {
  return `${AD_PROTOCOL}://${AD_HOSTNAME}:${AD_PORT}`;
}

/**
 * Crea un cliente LDAP
 */
function createLdapClient() {
  return ldap.createClient({
    url: ldapUrl(),
    timeout: 10000,
    connectTimeout: 10000
  });
}

/**
 * Realiza bind con la cuenta de servicio
 */
async function bindAsService(client) {
  console.log(`🔑 Conectando con cuenta de servicio: ${AD_BIND_USER}`);
  await new Promise((resolve, reject) =>
    client.bind(AD_BIND_USER, AD_BIND_PASS, err => {
      if (err) {
        console.error(`❌ Error en bind:`, err.message);
        return reject(err);
      }
      console.log(`✓ Conexión exitosa`);
      resolve();
    })
  );
}

/**
 * Cierra la conexión LDAP de forma segura
 */
async function unbindSafe(client) {
  return new Promise(res => client.unbind(() => res()));
}

/**
 * Busca todos los usuarios en Active Directory que tengan email
 */
async function getAllUsersWithEmail() {
  const client = createLdapClient();
  console.log(`\n🔍 Conectando a Active Directory: ${ldapUrl()}`);

  try {
    await bindAsService(client);

    // Filtro para buscar usuarios activos con email
    // userAccountControl:1.2.840.113556.1.4.803:=2 significa "cuenta deshabilitada"
    // El ! lo niega, así obtenemos solo cuentas activas
    const filter = '(&(objectCategory=person)(objectClass=user)(mail=*)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';
    const searchBase = AD_SEARCH_BASE || AD_BASE_DN;

    console.log(`🔍 Buscando usuarios con email en: ${searchBase}`);
    console.log(`🔍 Filtro: ${filter}\n`);

    const opts = {
      scope: 'sub',
      filter: filter,
      attributes: ['sAMAccountName', 'cn', 'displayName', 'mail', 'userPrincipalName', 'employeeID', 'department', 'title']
    };

    const entries = await new Promise((resolve, reject) => {
      const list = [];
      client.search(searchBase, opts, (err, res) => {
        if (err) {
          console.error(`❌ Error al iniciar búsqueda:`, err.message);
          return reject(err);
        }

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

          // Solo agregar si tiene email válido
          if (entry.mail && entry.mail.includes('@')) {
            list.push(entry);
          }
        });

        res.on('error', err => {
          console.error(`❌ Error durante búsqueda:`, err.message);
          reject(err);
        });

        res.on('end', () => {
          console.log(`\n📊 Total de usuarios con email encontrados: ${list.length}\n`);
          resolve(list);
        });
      });
    });

    return entries;
  } catch (error) {
    console.error(`❌ Error en búsqueda de usuarios:`, error.message);
    throw error;
  } finally {
    await unbindSafe(client);
  }
}

/**
 * Importa usuarios de AD a la base de datos
 */
async function importUsersToDatabase(users) {
  const pool = new Pool({
    connectionString: DATABASE_URL
  });

  try {
    console.log(`📦 Conectando a la base de datos...\n`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      const username = user.sAMAccountName;
      const name = user.displayName || user.cn || username;
      const email = user.mail;
      const employeeID = user.employeeID || null;
      const department = user.department || null;
      const title = user.title || null;

      try {
        // Verificar si el usuario ya existe
        const checkQuery = 'SELECT id, email, ad_username FROM users WHERE email = $1 OR ad_username = $2';
        const checkResult = await pool.query(checkQuery, [email, username]);

        if (checkResult.rows.length > 0) {
          console.log(`⏭️  Usuario ya existe: ${email} (${username})`);
          skipped++;
          continue;
        }

        // Insertar el usuario
        const insertQuery = `
          INSERT INTO users (name, email, ad_username, role, is_active, email_notifications)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, email, ad_username
        `;

        const result = await pool.query(insertQuery, [
          name,
          email,
          username,
          'user', // Rol por defecto
          true,   // Usuario activo
          true    // Notificaciones habilitadas por defecto
        ]);

        console.log(`✅ Usuario importado: ${result.rows[0].email} (${result.rows[0].ad_username})`);
        imported++;

      } catch (error) {
        console.error(`❌ Error al importar ${email} (${username}):`, error.message);
        errors++;
      }
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`📊 RESUMEN DE IMPORTACIÓN`);
    console.log(`═══════════════════════════════════════════════════════`);
    console.log(`✅ Usuarios importados: ${imported}`);
    console.log(`⏭️  Usuarios omitidos (ya existen): ${skipped}`);
    console.log(`❌ Errores: ${errors}`);
    console.log(`📈 Total procesados: ${users.length}`);
    console.log(`═══════════════════════════════════════════════════════\n`);

  } catch (error) {
    console.error('❌ Error en importación a base de datos:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Función principal
 */
async function main() {
  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  IMPORTACIÓN DE USUARIOS DE ACTIVE DIRECTORY         ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝\n`);

  try {
    // 1. Obtener usuarios de AD
    console.log(`[1/2] Obteniendo usuarios de Active Directory...`);
    const users = await getAllUsersWithEmail();

    if (users.length === 0) {
      console.log(`\n⚠️  No se encontraron usuarios con email en Active Directory`);
      return;
    }

    // Mostrar preview de usuarios
    console.log(`\n📋 PREVIEW DE USUARIOS ENCONTRADOS (primeros 10):`);
    console.log(`─────────────────────────────────────────────────────────`);
    users.slice(0, 10).forEach((user, i) => {
      console.log(`${i + 1}. ${user.displayName || user.cn}`);
      console.log(`   📧 Email: ${user.mail}`);
      console.log(`   👤 Usuario: ${user.sAMAccountName}`);
      if (user.department) console.log(`   🏢 Departamento: ${user.department}`);
      if (user.title) console.log(`   💼 Cargo: ${user.title}`);
      console.log(``);
    });

    if (users.length > 10) {
      console.log(`   ... y ${users.length - 10} usuarios más\n`);
    }

    // 2. Importar a la base de datos
    console.log(`[2/2] Importando usuarios a la base de datos...`);
    await importUsersToDatabase(users);

    console.log(`✅ Proceso completado exitosamente\n`);

  } catch (error) {
    console.error(`\n❌ Error en el proceso de importación:`, error.message);
    console.error(error);
    process.exit(1);
  }
}

// Ejecutar el script
main();
