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
  await new Promise((resolve, reject) =>
    client.bind(AD_BIND_USER, AD_BIND_PASS, err => {
      if (err) {
        console.error(`❌ Error en bind de servicio:`, err.message);
        return reject(err);
      }
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
 * Escapa caracteres especiales para filtros LDAP según RFC 4515
 * @param {string} str - String a escapar
 * @returns {string} - String escapado
 */
function escapeLdapFilter(str) {
  // No escapar caracteres UTF-8 normales, solo los que son especiales en LDAP
  return str
    .replace(/\\/g, '\\5c')  // Backslash
    .replace(/\*/g, '\\2a')  // Asterisco
    .replace(/\(/g, '\\28')  // Paréntesis izquierdo
    .replace(/\)/g, '\\29')  // Paréntesis derecho
    .replace(/\0/g, '\\00'); // Null
}

/**
 * Compone el filtro de búsqueda para el usuario
 * Asegura que el username esté correctamente codificado en UTF-8 y escapado
 */
function composeUserSearchFilter(username) {
  // Escapar caracteres especiales pero mantener UTF-8 (como Ñ)
  const escapedUsername = escapeLdapFilter(username);
  const base = AD_USER_SEARCH_FILTER || '(&(objectCategory=person)(objectClass=user))';
  return `(&${base}(sAMAccountName=${escapedUsername}))`;
}

/**
 * Busca la entrada del usuario en Active Directory
 */
async function searchUserEntry(username) {
  const client = createLdapClient();
  try {
    await bindAsService(client);
    const filter = composeUserSearchFilter(username);
    const searchBase = AD_SEARCH_BASE || AD_BASE_DN;

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

          list.push(entry);
        });
        res.on('error', err => {
          console.error(`❌ Error durante búsqueda:`, err.message);
          reject(err);
        });
        res.on('end', () => {
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
 * Decodifica secuencias UTF-8 escapadas en formato LDAP (\XX\XX)
 * Ejemplo: "Ria\c3\b1o" -> "Riaño"
 */
function decodeLdapDN(dn) {
  // Encontrar todas las secuencias \XX y convertirlas a bytes
  const bytes = [];
  let i = 0;

  while (i < dn.length) {
    if (dn[i] === '\\' && i + 2 < dn.length) {
      const hexStr = dn.substr(i + 1, 2);
      if (/^[0-9a-fA-F]{2}$/.test(hexStr)) {
        bytes.push(parseInt(hexStr, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(dn.charCodeAt(i));
    i++;
  }

  // Convertir los bytes a string UTF-8
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Codifica el DN para asegurar que esté en el formato correcto para bind
 * Convierte bytes UTF-8 a la representación que LDAP espera
 */
function encodeLdapDN(dn) {
  // Si el DN ya tiene secuencias escapadas (\XX), dejarlo como está
  if (/\\[0-9a-fA-F]{2}/.test(dn)) {
    return dn;
  }
  // Si tiene caracteres UTF-8 no-ASCII, convertirlos a secuencias escapadas
  return dn.replace(/[^\x00-\x7F]/g, (char) => {
    const bytes = Buffer.from(char, 'utf8');
    return Array.from(bytes)
      .map(byte => '\\' + byte.toString(16).padStart(2, '0'))
      .join('');
  });
}

/**
 * Verifica la contraseña del usuario haciendo bind con su DN
 */
async function verifyUserPassword(userDN, password) {
  const client = createLdapClient();

  // También intentar con DN decodificado en caso de que LDAP lo necesite
  const decodedDN = decodeLdapDN(userDN);

  try {
    // Intentar primero con el DN original (escapado)
    await new Promise((resolve, reject) =>
      client.bind(userDN, password, err => {
        if (err) {
          // Si falla, intentar con el DN decodificado
          client.bind(decodedDN, password, err2 => {
            if (err2) {
              console.error(`❌ Error al verificar contraseña con ambos DNs:`, err2.message);
              return reject(err2);
            }
            resolve();
          });
        } else {
          resolve();
        }
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
    // Buscar el usuario en AD
    const user = await searchUserEntry(username);

    // Verificar la contraseña
    await verifyUserPassword(user.dn, password);

    // Construir objeto de usuario
    // Prioridad para email: mail (campo de correo de AD) > userPrincipalName
    let email = user.mail;
    if (!email) {
      email = user.userPrincipalName;
    }
    if (!email) {
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

    return userInfo;
  } catch (error) {
    console.error('❌ Error en autenticación:', error.message);
    throw new Error('Usuario o contraseña inválidos');
  }
}

/**
 * Obtiene todos los usuarios activos de Active Directory
 * @returns {Promise<Array>} - Lista de usuarios con información básica
 */
async function getAllUsers() {
  const client = createLdapClient();
  try {
    await bindAsService(client);
    const filter = '(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))'; // Excluir usuarios deshabilitados
    const searchBase = AD_SEARCH_BASE || AD_BASE_DN;

    const opts = {
      scope: 'sub',
      filter: filter,
      attributes: ['dn', 'cn', 'displayName', 'mail', 'userPrincipalName', 'sAMAccountName', 'employeeID', 'userAccountControl']
    };

    const entries = await new Promise((resolve, reject) => {
      const list = [];
      client.search(searchBase, opts, (err, res) => {
        if (err) {
          console.error(`❌ Error al iniciar búsqueda de usuarios:`, err.message);
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

          list.push(entry);
        });
        res.on('error', err => {
          console.error(`❌ Error durante búsqueda de usuarios:`, err.message);
          reject(err);
        });
        res.on('end', () => {
          resolve(list);
        });
      });
    });

    // Filtrar usuarios válidos (con email y nombre)
    const validUsers = entries.filter(user =>
      user.mail &&
      user.displayName &&
      user.sAMAccountName &&
      !user.sAMAccountName.toLowerCase().includes('admin') // Excluir cuentas admin
    );

    // Convertir a formato de usuario del sistema
    const users = validUsers.map(user => ({
      username: user.sAMAccountName,
      name: user.displayName,
      email: user.mail.toLowerCase(),
      employeeID: user.employeeID || null,
      dn: user.dn,
      userPrincipalName: user.userPrincipalName
    }));

    console.log(`🔍 Encontrados ${users.length} usuarios válidos en Active Directory`);
    return users;
  } catch (error) {
    console.error(`❌ Error en getAllUsers:`, error.message);
    throw error;
  } finally {
    await unbindSafe(client);
  }
}

/**
 * Prueba la conexión con el servidor LDAP
 * @returns {Promise<boolean>} - true si la conexión es exitosa
 */
async function testConnection() {
  const client = createLdapClient();
  try {
    await bindAsService(client);
    console.log('✅ Conexión LDAP exitosa');
    return true;
  } catch (error) {
    console.error('❌ Error al probar conexión LDAP:', error.message);
    throw error;
  } finally {
    await unbindSafe(client);
  }
}

module.exports = {
  authenticateUser,
  testConnection,
  getAllUsers
};
