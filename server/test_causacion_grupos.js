/**
 * TEST: Verificación de Grupos de Causación
 *
 * Este test verifica que los grupos de causación tienen miembros
 * y que el sistema puede encontrarlos correctamente.
 */

const { query } = require('./database/db');

async function testCausacionGrupos() {
  console.log('\n🧪 ===== TEST: GRUPOS DE CAUSACIÓN =====\n');

  try {
    // 1. Verificar que existen grupos de causación
    console.log('📋 Verificando grupos de causación...');
    const gruposResult = await query(`
      SELECT id, codigo, nombre, descripcion, activo
      FROM causacion_grupos
      WHERE activo = true
      ORDER BY id
    `);

    console.log(`✅ Grupos encontrados: ${gruposResult.rows.length}`);
    gruposResult.rows.forEach(grupo => {
      console.log(`   - ${grupo.codigo}: ${grupo.nombre}`);
    });

    // 2. Verificar que hay integrantes en los grupos
    console.log('\n👥 Verificando integrantes de grupos...');
    const integrantesResult = await query(`
      SELECT ci.id, cg.nombre as grupo, u.name as usuario, ci.cargo, ci.activo
      FROM causacion_integrantes ci
      JOIN causacion_grupos cg ON ci.grupo_id = cg.id
      JOIN users u ON ci.user_id = u.id
      WHERE ci.activo = true AND cg.activo = true
      ORDER BY ci.id
    `);

    console.log(`✅ Integrantes encontrados: ${integrantesResult.rows.length}`);
    if (integrantesResult.rows.length === 0) {
      throw new Error('No hay integrantes activos en los grupos de causación');
    }

    integrantesResult.rows.forEach(integrante => {
      console.log(`   - ${integrante.usuario} (${integrante.cargo}) en ${integrante.grupo}`);
    });

    // 3. Verificar específicamente el grupo financiera
    console.log('\n🎯 Verificando grupo "financiera"...');
    const financieraResult = await query(`
      SELECT COUNT(*) as total_integrantes
      FROM causacion_integrantes ci
      JOIN causacion_grupos cg ON ci.grupo_id = cg.id
      WHERE cg.codigo = 'financiera' AND ci.activo = true AND cg.activo = true
    `);

    const totalFinanciera = parseInt(financieraResult.rows[0].total_integrantes);
    console.log(`✅ Integrantes en grupo financiera: ${totalFinanciera}`);

    if (totalFinanciera === 0) {
      throw new Error('No hay integrantes en el grupo de causación financiera');
    }

    // 4. Verificar integrantes esperados de financiera
    console.log('\n🔍 Verificando integrantes esperados de financiera...');
    const financieraMembersResult = await query(`
      SELECT u.name
      FROM causacion_integrantes ci
      JOIN causacion_grupos cg ON ci.grupo_id = cg.id
      JOIN users u ON ci.user_id = u.id
      WHERE cg.codigo = 'financiera'
        AND ci.activo = true
        AND cg.activo = true
    `);

    const financieraMembers = financieraMembersResult.rows
      .map(row => row.name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());
    const expectedFinancieraMembers = ['LUIS RIANO', 'ANGELICA MARTINEZ'];

    for (const expectedMember of expectedFinancieraMembers) {
      if (!financieraMembers.includes(expectedMember)) {
        throw new Error(`${expectedMember} no está asignado al grupo financiera`);
      }
    }

    console.log(`✅ Integrantes esperados de financiera encontrados: ${expectedFinancieraMembers.join(', ')}`);

    // 5. Verificar integrantes esperados de logistica
    console.log('\n🔍 Verificando integrantes esperados de logistica...');
    const logisticaMembersResult = await query(`
      SELECT u.name
      FROM causacion_integrantes ci
      JOIN causacion_grupos cg ON ci.grupo_id = cg.id
      JOIN users u ON ci.user_id = u.id
      WHERE cg.codigo = 'logistica'
        AND ci.activo = true
        AND cg.activo = true
    `);

    const logisticaMembers = logisticaMembersResult.rows
      .map(row => row.name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());
    const expectedLogisticaMembers = ['MARIANA GONZALEZ', 'CRISTINA GOMEZ'];

    for (const expectedMember of expectedLogisticaMembers) {
      if (!logisticaMembers.includes(expectedMember)) {
        throw new Error(`${expectedMember} no está asignado al grupo logistica`);
      }
    }

    console.log(`✅ Integrantes esperados de logistica encontrados: ${expectedLogisticaMembers.join(', ')}`);

    console.log('\n✅ ===== TEST PASSED =====');
    console.log('🎉 Los grupos de causación están correctamente configurados!');
    console.log('   - Grupos activos: ✅');
    console.log('   - Integrantes asignados: ✅');
    console.log('   - Grupo financiera con miembros esperados: ✅');
    console.log('   - Grupo logistica con miembros esperados: ✅\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ===== TEST FAILED =====');
    console.error('Error durante el test:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar test
testCausacionGrupos();
