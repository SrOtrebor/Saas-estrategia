const fs = require('fs');
const html = fs.readFileSync('muestras_diseños.html', 'utf-8');
const base64Regex = /src="data:text\/html;base64,([^"]+)"/g;
let match;
let finalHtml = '';
while ((match = base64Regex.exec(html)) !== null) {
  let decoded = Buffer.from(match[1], 'base64').toString('utf-8');
  
  // Replace colors
  decoded = decoded.replace(/#a28a68/gi, '{{COLOR_PRIMARIO}}');
  decoded = decoded.replace(/#0e132b/gi, '{{COLOR_SECUNDARIO}}');
  decoded = decoded.replace(/#e0e1dd/gi, '{{COLOR_CLARO}}');
  decoded = decoded.replace(/#39506b/gi, '{{COLOR_MEDIO}}');
  
  // Replace the exact HTML content block with {{TEXTO}}
  const contentRegex = /<div class="content-wrapper">([\s\S]*?)<\/div><div class="footer">/i;
  decoded = decoded.replace(contentRegex, '<div class="content-wrapper">{{TEXTO}}</div><div class="footer">');

  // Replace the image url with {{LOGO_URL}}
  const logoRegex = /<img src="https:\/\/via\.placeholder\.com[^"]+" class="logo">/i;
  decoded = decoded.replace(logoRegex, '<img src="{{LOGO_URL}}" class="logo">');

  finalHtml += decoded + '\n\n';
}

fs.writeFileSync('plantillas_a_cargar.html', finalHtml);
console.log('Extraídas ' + (finalHtml.match(/<!DOCTYPE html>/g) || []).length + ' plantillas.');
