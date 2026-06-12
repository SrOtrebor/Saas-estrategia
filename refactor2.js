const fs = require('fs');

// 1. Rewrite plantillas_a_cargar.html to revert the {{COLOR_*}} variables back to hex codes
let cargar = fs.readFileSync('plantillas_a_cargar.html', 'utf8');
cargar = cargar.replace(/\{\{COLOR_PRIMARIO\}\}/g, '#a28a68');
cargar = cargar.replace(/\{\{COLOR_SECUNDARIO\}\}/g, '#0e132b');
cargar = cargar.replace(/\{\{COLOR_CLARO\}\}/g, '#e0e1dd');
cargar = cargar.replace(/\{\{COLOR_MEDIO\}\}/g, '#39506b');
fs.writeFileSync('plantillas_a_cargar.html', cargar);

// 2. Rewrite muestrario_plantillas.html
let muestrario = fs.readFileSync('muestrario_plantillas.html', 'utf8');
muestrario = muestrario.replace(/\$\{color_primario\}/g, '#a28a68');
muestrario = muestrario.replace(/\$\{color_secundario\}/g, '#0e132b');
muestrario = muestrario.replace(/\$\{color_claro\}/g, '#e0e1dd');
muestrario = muestrario.replace(/\$\{color_medio\}/g, '#39506b');
fs.writeFileSync('muestrario_plantillas.html', muestrario);

// 3. Rewrite imageGenerator.ts to remove `identidad.color_primario_hex` completely
let imgGen = fs.readFileSync('functions/src/lib/imageGenerator.ts', 'utf8');

// The signature of obtenerTodasLasPlantillasHTML doesn't need 'identidad' if it doesn't use it for colors anymore,
// but let's keep it just in case, or just remove the replace logic.
imgGen = imgGen.replace(/function obtenerTodasLasPlantillasHTML\(identidad: IdentidadVisual, customTemplates: string\[\]\): string\[\] \{[\s\S]*?const plantillasDefault = \[/m, 
`function obtenerTodasLasPlantillasHTML(customTemplates: string[]): string[] {
  const cAccent = "#a28a68";
  const plantillasDefault = [`);

// Also update the replace logic inside customTemplates
imgGen = imgGen.replace(/if \(customTemplates && customTemplates\.length > 0\) \{[\s\S]*?result = \[\.\.\.result, \.\.\.custom\];\n  \}/m, 
`if (customTemplates && customTemplates.length > 0) {
    result = [...result, ...customTemplates];
  }`);

// Update the call inside generarCarrusel and generarContenidoEspontaneo and test
imgGen = imgGen.replace(/obtenerTodasLasPlantillasHTML\(identidad, todasLasPlantillas\)/g, 'obtenerTodasLasPlantillasHTML(todasLasPlantillas)');

fs.writeFileSync('functions/src/lib/imageGenerator.ts', imgGen);

console.log('Script done');
