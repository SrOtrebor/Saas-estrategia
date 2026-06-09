const fs = require('fs');
const content = fs.readFileSync('E:/SaaS-estrategias/muestras_diseños.html', 'utf8');
const regex = /src="data:text\/html;base64,([^"]+)"/g;
let match;
let plantillas = [];
while((match = regex.exec(content)) !== null) {
  let decoded = Buffer.from(match[1], 'base64').toString('utf8');
  // Replace the hardcoded text with {{TEXTO}}
  decoded = decoded.replace(/<div class="content-wrapper">[\s\S]*?<\/div><div class="footer">/, '<div class="content-wrapper">{{TEXTO}}</div><div class="footer">');
  // Replace the logo
  decoded = decoded.replace(/<img src="[^"]+" class="logo">/, '<img src="{{LOGO_URL}}" class="logo">');
  
  // Replace colors with variables to allow SaaS dynamic usage, but fallback to their exact hex
  // Their colors:
  // #a28a68 = Accent (colorPrimario)
  // #0e132b = Dark Bg (colorSecundario)
  // #e0e1dd = Light text/bg (colorLight)
  // #39506b = Mid Bg (colorMid)
  
  decoded = decoded.split('#a28a68').join('${cAccent}');
  decoded = decoded.split('#0e132b').join('${cDark}');
  decoded = decoded.split('#e0e1dd').join('${cLight}');
  decoded = decoded.split('#39506b').join('${cMid}');
  
  plantillas.push('`' + decoded + '`');
}

let code = fs.readFileSync('E:/SaaS-estrategias/functions/src/lib/imageGenerator.ts', 'utf8');
// Find the plantillas array and replace it
const startTag = 'const plantillas = [';
const endTag = '  ];\n\n  // Elegir una al azar';

const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag);

if(startIndex === -1 || endIndex === -1) {
  console.error("Could not find plantillas array");
  process.exit(1);
}

const replacement = `  const cAccent = identidad.color_primario_hex || "#a28a68";
  const cDark = identidad.color_secundario_hex || "#0e132b";
  const cLight = "#e0e1dd"; // Fijo para mantener contraste
  const cMid = "#39506b"; // Fijo para mantener contraste

  const logo = "{{LOGO_URL}}";
  const texto = "{{TEXTO}}";

  const plantillas = [\n    ${plantillas.join(',\n\n    ')}\n`;

const newCode = code.substring(0, code.indexOf('function generarPlantillaHTML')) + 
  `function generarPlantillaHTML(identidad: IdentidadVisual): string {
${replacement}` + code.substring(endIndex);

fs.writeFileSync('E:/SaaS-estrategias/functions/src/lib/imageGenerator.ts', newCode);
console.log("Successfully updated imageGenerator.ts");
