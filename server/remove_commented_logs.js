const fs = require('fs');
const path = require('path');

const files = [
  'graphql/resolvers-db.js',
  'routes/upload.js',
  'routes/facturas.js',
  'utils/pdfMerger.js',
  'utils/puppeteerPool.js'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Filtrar líneas que son comentarios de console.log
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      // Eliminar líneas que son console.log comentados
      return !(trimmed.startsWith('// console.log('));
    });

    const newContent = filteredLines.join('\n');
    fs.writeFileSync(filePath, newContent);
    console.log(`✅ ${file} procesado`);
  } catch (err) {
    console.error(`❌ Error en ${file}:`, err.message);
  }
});

console.log('✅ Eliminación completada');
