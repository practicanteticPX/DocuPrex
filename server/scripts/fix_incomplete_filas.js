/**
 * Script para corregir filas incompletas en metadata de documentos FV
 * Copia los datos de cuenta contable cuando están presentes en otra fila con la misma cuenta
 */

const { pool } = require('../database/db');

async function fixIncompleteFilas() {
  const client = await pool.connect();

  try {
    console.log('🔍 Buscando documentos FV con filas incompletas...\n');

    // Obtener todos los documentos FV
    const docsResult = await client.query(`
      SELECT d.id, d.title, d.metadata
      FROM documents d
      WHERE d.document_type_id = (SELECT id FROM document_types WHERE code = 'FV')
      ORDER BY d.created_at DESC
    `);

    let documentosCorregidos = 0;
    let filasCorregidas = 0;

    for (const doc of docsResult.rows) {
      const metadata = doc.metadata;
      const filasControl = metadata.filasControl || [];

      if (filasControl.length === 0) continue;

      let hasChanges = false;
      const updatedFilas = [...filasControl];

      // Crear un mapa de cuentas contables con datos completos
      const cuentasCompletas = new Map();

      // Primera pasada: Recopilar datos completos
      filasControl.forEach((fila, index) => {
        const cuenta = fila.noCuentaContable;

        if (cuenta && fila.respCuentaContable && fila.cargoCuentaContable && fila.nombreCuentaContable) {
          // Esta fila tiene datos completos
          if (!cuentasCompletas.has(cuenta)) {
            cuentasCompletas.set(cuenta, {
              respCuentaContable: fila.respCuentaContable,
              cargoCuentaContable: fila.cargoCuentaContable,
              nombreCuentaContable: fila.nombreCuentaContable
            });
          }
        }
      });

      // Segunda pasada: Corregir filas incompletas
      filasControl.forEach((fila, index) => {
        const cuenta = fila.noCuentaContable;

        // Si la fila tiene cuenta pero le faltan datos de responsable/cargo/nombre
        if (cuenta &&
            (!fila.respCuentaContable || !fila.cargoCuentaContable || !fila.nombreCuentaContable)) {

          // Buscar datos completos para esta cuenta
          if (cuentasCompletas.has(cuenta)) {
            const datosCompletos = cuentasCompletas.get(cuenta);

            console.log(`📋 Doc ${doc.id} - Fila ${index + 1}:`);
            console.log(`   Cuenta: ${cuenta}`);
            console.log(`   ❌ ANTES:`);
            console.log(`      Responsable: "${fila.respCuentaContable}"`);
            console.log(`      Cargo: "${fila.cargoCuentaContable}"`);
            console.log(`      Nombre Cuenta: "${fila.nombreCuentaContable}"`);

            updatedFilas[index] = {
              ...fila,
              respCuentaContable: datosCompletos.respCuentaContable,
              cargoCuentaContable: datosCompletos.cargoCuentaContable,
              nombreCuentaContable: datosCompletos.nombreCuentaContable
            };

            console.log(`   ✅ DESPUÉS:`);
            console.log(`      Responsable: "${datosCompletos.respCuentaContable}"`);
            console.log(`      Cargo: "${datosCompletos.cargoCuentaContable}"`);
            console.log(`      Nombre Cuenta: "${datosCompletos.nombreCuentaContable}"\n`);

            hasChanges = true;
            filasCorregidas++;
          } else {
            console.warn(`⚠️  Doc ${doc.id} - Fila ${index + 1}: Cuenta "${cuenta}" incompleta SIN datos de referencia\n`);
          }
        }
      });

      // Actualizar el documento si hubo cambios
      if (hasChanges) {
        const updatedMetadata = {
          ...metadata,
          filasControl: updatedFilas
        };

        await client.query(
          'UPDATE documents SET metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [JSON.stringify(updatedMetadata), doc.id]
        );

        console.log(`✅ Documento ${doc.id} ("${doc.title}") corregido\n`);
        documentosCorregidos++;
      }
    }

    console.log('\n========================================');
    console.log(`✅ Proceso completado`);
    console.log(`   Documentos corregidos: ${documentosCorregidos}`);
    console.log(`   Filas corregidas: ${filasCorregidas}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Ejecutar el script
fixIncompleteFilas()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error ejecutando script:', error);
    process.exit(1);
  });
