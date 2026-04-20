const { query } = require('./database/db');

async function test() {
  try {
    const result = await query('SELECT id, role_code FROM document_type_roles WHERE id = ANY($1)', [['d2d0aa35-045d-4b76-b070-843c8011ac35', '7e682eae-1909-4492-93e1-891921b46433']]);
    console.log('Success:', result.rows.length);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();