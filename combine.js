const fs = require('fs');

// 1. Get the 8 templates from plantillas_a_cargar.html
const cargarHtml = fs.readFileSync('plantillas_a_cargar.html', 'utf8');
const regex = /<!DOCTYPE html>[\s\S]*?<\/html>/gi;
const templatesA = cargarHtml.match(regex) || [];

// 2. Get the 8 templates from muestrario_plantillas.html
const muestrarioHtml = fs.readFileSync('muestrario_plantillas.html', 'utf8');
const pStart = muestrarioHtml.indexOf('const plantillas = [');
const pEnd = muestrarioHtml.indexOf('];', pStart);
const plantillasArrayStr = muestrarioHtml.substring(pStart, pEnd + 2);

// We need to parse this array carefully. It's composed of template literals.
// Let's extract them using a regex that matches `<html` ... `</html>` inside backticks.
const htmlRegex = /<!DOCTYPE html>[\s\S]*?<\/html>/gi;
const templatesB_raw = plantillasArrayStr.match(htmlRegex) || [];

// 3. Process templatesB to be importable (for plantillas_a_cargar)
const templatesB_importable = templatesB_raw.map(t => {
  return t
    .replace(/\$\{color\}/g, '{{COLOR_PRIMARIO}}')
    .replace(/\$\{texto\}/g, '{{TEXTO}}')
    .replace(/\$\{logo\}/g, '{{LOGO_URL}}');
});

// 4. Process templatesA to be visual (for muestrario)
const templatesA_visual = templatesA.map(t => {
  return t
    .replace(/\{\{COLOR_PRIMARIO\}\}/g, '${color_primario}')
    .replace(/\{\{COLOR_SECUNDARIO\}\}/g, '${color_secundario}')
    .replace(/\{\{COLOR_CLARO\}\}/g, '${color_claro}')
    .replace(/\{\{COLOR_MEDIO\}\}/g, '${color_medio}')
    .replace(/\{\{TEXTO\}\}/g, '${texto}')
    .replace(/\{\{LOGO_URL\}\}/g, '${logo}');
});

// Write the combined importable file
const combinedImportable = [...templatesB_importable, ...templatesA].join('\n\n');
fs.writeFileSync('plantillas_16_importar.html', combinedImportable);

// Write the combined visual file
// We will use the layout of muestrario_plantillas.html
let newMuestrario = muestrarioHtml.substring(0, pStart);
newMuestrario += `const color = "#a28a68";
const color_primario = "#a28a68";
const color_secundario = "#0e132b";
const color_claro = "#e0e1dd";
const color_medio = "#39506b";

const plantillas = [\n`;

for (let i = 0; i < templatesB_raw.length; i++) {
  newMuestrario += '`' + templatesB_raw[i] + '`,\n';
}
for (let i = 0; i < templatesA_visual.length; i++) {
  newMuestrario += '`' + templatesA_visual[i] + '`' + (i === templatesA_visual.length - 1 ? '' : ',') + '\n';
}
newMuestrario += '];\n';

const scriptEnd = muestrarioHtml.indexOf('const container = document.getElementById');
newMuestrario += muestrarioHtml.substring(scriptEnd);

fs.writeFileSync('muestrario_16_plantillas.html', newMuestrario);

console.log('Combined! Total importable: ' + (templatesB_importable.length + templatesA.length));
console.log('Total visual: ' + (templatesB_raw.length + templatesA_visual.length));
