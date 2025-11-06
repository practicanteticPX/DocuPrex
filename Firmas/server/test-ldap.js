require('dotenv').config();
const { authenticateUser, testConnection } = require('./services/ldap');

async function testLDAP() {
  console.log('=== TEST DE CONEXIÓN LDAP ===\n');

  // Mostrar configuración (sin contraseña)
  console.log('Configuración:');
  console.log(`- Protocolo: ${process.env.AD_PROTOCOL}`);
  console.log(`- Host: ${process.env.AD_HOSTNAME}`);
  console.log(`- Puerto: ${process.env.AD_PORT}`);
  console.log(`- Base DN: ${process.env.AD_BASE_DN}`);
  console.log(`- Usuario servicio: ${process.env.AD_BIND_USER}`);
  console.log(`- Contraseña servicio: ${process.env.AD_BIND_PASS ? '***' : 'NO DEFINIDA'}`);
  console.log(`- Search Base: ${process.env.AD_SEARCH_BASE}`);
  console.log(`- Filtro: ${process.env.AD_USER_SEARCH_FILTER}\n`);

  // Solicitar usuario de prueba
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Usuario de prueba (ejemplo: jperez): ', (username) => {
    rl.question('Contraseña: ', async (password) => {
      rl.close();

      try {
        console.log('\n=== Iniciando autenticación ===\n');
        const user = await authenticateUser(username, password);

        console.log('\n✅ AUTENTICACIÓN EXITOSA!');
        console.log('\nDatos del usuario:');
        console.log(JSON.stringify(user, null, 2));
      } catch (error) {
        console.log('\n❌ AUTENTICACIÓN FALLIDA');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
      }

      process.exit(0);
    });
  });
}

testLDAP();
