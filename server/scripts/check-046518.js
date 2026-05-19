const { query } = require('../database/db');
const { queryFacturas } = require('../database/facturas-db');

async function check() {
  const doc = await query(`
    SELECT id, title, consecutivo, status
    FROM documents WHERE title ILIKE '%046518%' OR title ILIKE '%COLOMBIA MOVIL%'
    ORDER BY created_at DESC LIMIT 5
  `);
  console.log('DocuPrex:', doc.rows);

  if (doc.rows[0]?.consecutivo) {
    const f = await queryFacturas(`
      SELECT numero_control, numero_factura, en_proceso, rechazada, corregida
      FROM crud_facturas."T_Facturas"
      WHERE numero_control = $1::int
    `, [doc.rows[0].consecutivo]);
    console.log('T_Facturas:', f.rows);
  }
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
