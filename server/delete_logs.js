const fs = require('fs');
const path = require('path');

const files = {
  'routes/upload.js': [/console\.log\(`🗑️  Limpiando archivos temporales/],
  'graphql/resolvers-db.js': [
    /console\.log\(`🔍 DEBUG: document_type_code=/,
    /console\.log\(`📄 Documento FV detectado - respetando orden basado en roles`\);/,
    /console\.log\(`🔍 Verificando cédula para:/,
    /console\.log\(`🔢 Últimos 4 dígitos recibidos:/,
    /console\.log\(`👤 Usuario:/,
    /console\.log\(`💳 Cédula completa en BD:/,
    /console\.log\(`🔢 Últimos 4 en BD:/,
    /console\.log\(`🔢 Últimos 4 recibidos:/,
    /console\.log\(`✅ ¿Coinciden/,
    /console\.log\(`✅ Verificación exitosa/,
    /console\.log\(`   - Firmantes del grupo de causación:/
  ],
  'utils/pdfMerger.js': [/console\.log\(`📋 Documento FV con metadata detectado/],
  'routes/facturas.js': [/console\.log\(`📤 Enviando respuesta:/]
};

Object.entries(files).forEach(([file, patterns]) => {
  const filePath = path.join(__dirname, file);
  try {
    let lines = fs.readFileSync(filePath, 'utf8').split('\n');
    lines = lines.filter(line => !patterns.some(p => p.test(line)));
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`✅ ${file}`);
  } catch (err) {
    console.error(`❌ ${file}:`, err.message);
  }
});
