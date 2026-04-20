/**
 * TEST: Verificación de Usuario NEGOCIACIONES
 *
 * Este test verifica que el usuario NEGOCIACIONES existe y puede ser usado
 * en el flujo de creación de facturas.
 */

const { query } = require('./database/db');

async function testNegociacionesUser() {
  console.log('\n🧪 ===== TEST: USUARIO NEGOCIACIONES =====\n');

  try {
    // 1. Verificar que el usuario NEGOCIACIONES existe
    console.log('👤 Buscando usuario NEGOCIACIONES...');
    const userResult = await query(`
      SELECT id, name, email, role
      FROM users
      WHERE UPPER(TRIM(name)) = 'NEGOCIACIONES'
    `);

    if (userResult.rows.length === 0) {
      throw new Error('Usuario NEGOCIACIONES no encontrado en la base de datos');
    }

    const user = userResult.rows[0];
    console.log(`✅ Usuario encontrado:`);
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Name: ${user.name}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Role: ${user.role}\n`);

    // 2. Verificar que los roles de FV existen
    console.log('🔍 Verificando roles de documento FV...');
    const rolesResult = await query(`
      SELECT id, role_code, role_name
      FROM document_type_roles
      WHERE document_type_id = (
        SELECT id FROM document_types WHERE code = 'FV' AND is_active = true
      )
    `);

    console.log(`✅ Roles FV encontrados: ${rolesResult.rows.length}`);
    rolesResult.rows.forEach(role => {
      console.log(`   - ${role.role_code}: ${role.role_name}`);
    });

    // 3. Verificar que las queries de optimización funcionan
    console.log('\n🔄 Probando queries de optimización...');
    const testQuery = await query(
      'SELECT id, role_code FROM document_type_roles WHERE id = ANY($1)',
      [[rolesResult.rows[0].id]]
    );

    console.log(`✅ Query de optimización funciona: ${testQuery.rows.length} resultado(s)`);

    console.log('\n✅ ===== TEST PASSED =====');
    console.log('🎉 El usuario NEGOCIACIONES y el sistema de roles están listos para facturas!');
    console.log('   - Usuario NEGOCIACIONES: ✅');
    console.log('   - Roles FV: ✅');
    console.log('   - Queries optimizadas: ✅\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ===== TEST FAILED =====');
    console.error('Error durante el test:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar test
testNegociacionesUser();