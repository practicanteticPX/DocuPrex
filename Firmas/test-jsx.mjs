import { parse } from '@babel/parser';
import { readFileSync } from 'fs';

try {
  const code = readFileSync('D:\\Firmas\\frontend\\src\\components\\dashboard\\Dashboard-funcional.jsx', 'utf8');
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx']
  });
  console.log('✅ JSX syntax is valid!');
} catch (error) {
  console.error('❌ JSX syntax error:');
  console.error(error.message);
  if (error.loc) {
    console.error(`Location: Line ${error.loc.line}, Column ${error.loc.column}`);
  }
}
