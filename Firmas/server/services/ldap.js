const ldap = require('ldapjs');

// Configuración Active Directory desde variables de entorno
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

/**
 * Construye la URL del servidor LDAP
 */
function ldapUrl() {
  const host = AD_HOSTNAME;
  return `${AD_PROTOCOL}://${host}:${AD_PORT}`;
}

/**
 * Crea un cliente LDAP sin TLS
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
  console.log(`🔑 Intentando bind con cuenta de servicio: ${AD_BIND_USER}`);
  await new Promise((resolve, reject) =>
    client.bind(AD_BIND_USER, AD_BIND_PASS, err => {
      if (err) {
        console.error(`❌ Error en bind de servicio:`, err.message);
        return reject(err);
      }
      console.log(`✓ Bind de servicio exitoso`);
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
 * Compone el filtro de búsqueda para el usuario
 */
function composeUserSearchFilter(username) {
  const base = AD_USER_SEARCH_FILTER || '(&(objectCategory=person)(objectClass=user))';
  return `(&${base}(sAMAccountName=${username}))`;
}

/**
 * Busca la entrada del usuario en Active Directory
 */
async function searchUserEntry(username) {
  const client = createLdapClient();
  console.log(`🔍 URL LDAP: ${ldapUrl()}`);
  try {
    await bindAsService(client);
    const filter = composeUserSearchFilter(username);
    const searchBase = AD_SEARCH_BASE || AD_BASE_DN;
    console.log(`🔍 Buscando usuario con filtro: ${filter}`);
    console.log(`🔍 Base de búsqueda: ${searchBase}`);

    const opts = {
      scope: 'sub',
      filter: filter,
      attributes: ['dn', 'cn', 'displayName', 'mail', 'userPrincipalName', 'sAMAccountName', 'employeeID']
    };
    const entries = await new Promise((resolve, reject) => {
      const list = [];
      client.search(searchBase, opts, (err, res) => {
        if (err) {
          console.error(`❌ Error al iniciar búsqueda:`, err.message);
          return reject(err);
        }
        res.on('searchEntry', e => {
          console.log(`✓ Entrada encontrada: ${e.objectName}`);
          // Convertir atributos de LDAP a objeto simple
          const entry = {
            dn: String(e.objectName) // Asegurar que DN sea string
          };

          // Procesar cada atributo
          if (e.attributes) {
            e.attributes.forEach(attr => {
              const name = attr.type || attr.name;
              const values = attr.values || attr.vals || [];
              // Convertir Buffer a string si es necesario
              const processedValues = values.map(v =>
                Buffer.isBuffer(v) ? v.toString('utf8') : String(v)
              );
              // Si solo hay un valor, guardarlo directamente; si hay múltiples, guardar array
              entry[name] = processedValues.length === 1 ? processedValues[0] : processedValues;
            });
          }

          console.log(`📋 Atributos del usuario:`, JSON.stringify(entry, null, 2));
          list.push(entry);
        });
        res.on('error', err => {
          console.error(`❌ Error durante búsqueda:`, err.message);
          reject(err);
        });
        res.on('end', () => {
          console.log(`📊 Total de entradas encontradas: ${list.length}`);
          resolve(list);
        });
      });
    });
    if (!entries.length) throw new Error('Usuario no encontrado');
    return entries[0];
  } catch (error) {
    console.error(`❌ Error en searchUserEntry:`, error.message);
    throw error;
  } finally {
    await unbindSafe(client);
  }
}

/**
 * Verifica la contraseña del usuario haciendo bind con su DN
 */
async function verifyUserPassword(userDN, password) {
  const client = createLdapClient();
  console.log(`🔐 Verificando contraseña para DN: ${userDN}`);
  try {
    await new Promise((resolve, reject) =>
      client.bind(userDN, password, err => {
        if (err) {
          console.error(`❌ Error al verificar contraseña:`, err.message);
          return reject(err);
        }
        console.log(`✓ Contraseña verificada correctamente`);
        resolve();
      })
    );
    return true;
  } catch (error) {
    console.error(`❌ Error en verifyUserPassword:`, error.message);
    throw error;
  } finally {
    await unbindSafe(client);
  }
}

/**
 * Autentica un usuario contra Active Directory
 * @param {string} username - Usuario (sAMAccountName)
 * @param {string} password - Contraseña del usuario
 * @returns {Promise<Object>} - Información del usuario autenticado
 */
async function authenticateUser(username, password) {
  try {
    console.log(`🔐 Intentando autenticar usuario: ${username}`);

    // Buscar el usuario en AD
    const user = await searchUserEntry(username);
    console.log(`✓ Usuario encontrado: ${user.displayName || user.cn}`);

    // Verificar la contraseña
    await verifyUserPassword(user.dn, password);
    console.log(`✓ Contraseña verificada para: ${username}`);

    // Construir objeto de usuario
    // Prioridad para email: mail (campo de correo de AD) > userPrincipalName
    let email = user.mail;
    if (!email) {
      console.warn(`⚠️  Usuario ${user.sAMAccountName} no tiene campo 'mail' en AD, usando userPrincipalName`);
      email = user.userPrincipalName;
    }
    if (!email) {
      console.warn(`⚠️  Usuario ${user.sAMAccountName} no tiene email en AD, generando email por defecto`);
      email = `${user.sAMAccountName}@prexxa.local`;
    }

    const userInfo = {
      username: user.sAMAccountName,
      name: user.displayName || user.cn,
      email: email,
      employeeID: user.employeeID || null,
      dn: user.dn,
      userPrincipalName: user.userPrincipalName
    };

    console.log('✓ Autenticación exitosa:', userInfo.username);
    return userInfo;
  } catch (error) {
    console.error('❌ Error en autenticación:', error.message);
    throw new Error('Usuario o contraseña inválidos');
  }
}

/**
 * Prueba la conexión con el servidor LDAP
 * @returns {Promise<boolean>} - true si la conexión es exitosa
 */
async function testConnection() {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: LDAP_URL,
      reconnect: false
    });

    // Intentar una búsqueda simple para verificar conectividad
    const opts = {
      filter: '(objectClass=*)',
      scope: 'base',
      attributes: ['namingContexts']
    };

    client.search('', opts, (err, res) => {
      if (err) {
        console.error('Error al probar conexión:', err.message);
        client.unbind();
        return reject(new Error('No se pudo conectar al servidor LDAP'));
      }

      res.on('searchEntry', () => {
        console.log('✓ Conexión LDAP exitosa');
      });

      res.on('error', (searchErr) => {
        console.error('Error en búsqueda de prueba:', searchErr.message);
        client.unbind();
        reject(new Error('Error al probar conexión LDAP'));
      });

      res.on('end', () => {
        client.unbind();
        resolve(true);
      });
    });

    client.on('error', (err) => {
      console.error('Error de conexión:', err.message);
      reject(new Error('No se pudo conectar al servidor LDAP'));
    });
  });
}

module.exports = {
  authenticateUser,
  testConnection
};
