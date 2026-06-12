const fs = require('fs');
let content = fs.readFileSync('dashboard/src/pages/AdminDashboard.tsx', 'utf8');

// Remove from IdentidadVisual interface
content = content.replace(/color_primario_hex: string;\s*color_secundario_hex: string;\s*/g, '');

// Remove from initialFormData
content = content.replace(/color_primario_hex: '#000000',\s*color_secundario_hex: '#FFFFFF',\s*/g, '');

// Remove from reset state in handleAddMarca
content = content.replace(/identidad_visual: \{ color_primario_hex: '#000000', color_secundario_hex: '#FFFFFF', logo_url: '' \}/g, 'identidad_visual: { logo_url: \\'\\' }');

// Remove UI elements
const colorPrimarioRegex = /<div>\s*<label className=\"block text-sm font-medium text-gray-300 mb-1 flex justify-between\">Color Primario[\s\S]*?<\/div>\s*<\/div>\s*/g;
content = content.replace(colorPrimarioRegex, '');

const colorSecundarioRegex = /<div>\s*<label className=\"block text-sm font-medium text-gray-300 mb-1 flex justify-between\">Color Secundario[\s\S]*?<\/div>\s*<\/div>\s*/g;
content = content.replace(colorSecundarioRegex, '');

fs.writeFileSync('dashboard/src/pages/AdminDashboard.tsx', content);

let interfaces = fs.readFileSync('functions/src/interfaces.ts', 'utf8');
interfaces = interfaces.replace(/color_primario_hex: string;\s*color_secundario_hex: string;\s*/g, '');
fs.writeFileSync('functions/src/interfaces.ts', interfaces);

console.log('Done');
