const fs = require('fs');
const file = 'e:/SaaS-estrategias/functions/src/functions/generarContenidoEspontaneo.ts';
let code = fs.readFileSync(file, 'utf8');

const newFunc = `function getLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function getBrightColor(hex: string): string {
  if (getLuminance(hex) > 0.4) return hex;
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16) || 0;
  let g = parseInt(h.substring(2, 4), 16) || 0;
  let b = parseInt(h.substring(4, 6), 16) || 0;
  r = Math.min(255, Math.floor(r + (255 - r) * 0.6));
  g = Math.min(255, Math.floor(g + (255 - g) * 0.6));
  b = Math.min(255, Math.floor(b + (255 - b) * 0.6));
  return \`#\${r.toString(16).padStart(2, '0')}\${g.toString(16).padStart(2, '0')}\${b.toString(16).padStart(2, '0')}\`;
}

async function generarPlantillaHTML(ai: GoogleGenAI, marca: MarcaConfig): Promise<string> {
  const rawColor = marca.identidad_visual.color_primario_hex || "#d4af37";
  const color = rawColor.startsWith('#') ? rawColor : '#' + rawColor;
  const isDark = getLuminance(color) < 0.5;
  const textColorOnColor = isDark ? "#ffffff" : "#111111";
  const brightColor = getBrightColor(color);
  
  const logo = "{{LOGO_URL}}";
  const texto = "{{TEXTO}}";
  const fontImport = \`<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800;900&display=swap" rel="stylesheet">\`;

  const plantillas = [
    // VARIANTE 1: CLARO / BLANCO (Fondo blanco, borde grueso)
    \`<!DOCTYPE html><html><head><meta charset="UTF-8">\${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #ffffff; color: #222222; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 50px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-left: 20px solid \${color}; background-color: #f8f9fa; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; }
      .logo { max-height: 50px; filter: grayscale(1) contrast(2); opacity: 0.8; }
      h2 { color: \${color}; padding: 0; font-size: 22px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; letter-spacing: 1px; border-bottom: 4px solid \${color}; }
      h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #111111; }
      p { font-size: 28px; line-height: 1.4; color: #444444; margin: 0 0 20px 0; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 28px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 600; color: #333333; }
      li::before { content: '■'; position: absolute; left: 0; color: \${color}; }
      .highlight { background: rgba(0,0,0,0.05); border-left: 6px solid \${color}; padding: 20px 30px; font-size: 26px; font-weight: 800; color: #111111; margin-top: auto; width: 100%; box-sizing: border-box; }
    </style></head><body><div class="card"><div class="content-wrapper">\${texto}</div><div class="footer"><img src="\${logo}" class="logo"></div></div></body></html>\`,

    // VARIANTE 2: OSCURO PREMIUM (Usa brightColor para que resalte)
    \`<!DOCTYPE html><html><head><meta charset="UTF-8">\${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #0b0f19; color: #f5f5f5; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 50px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.4); box-shadow: 15px 15px 0px \${brightColor}30; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-end; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: brightness(0) invert(1); opacity: 0.6; }
      h2 { color: \${brightColor}; font-size: 20px; font-weight: 700; border-left: 4px solid \${brightColor}; padding-left: 15px; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
      h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #ffffff; }
      p { font-size: 28px; line-height: 1.4; color: #d0d0d0; margin: 0 0 20px 0; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 28px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 500; color: #e0e0e0; }
      li::before { content: '━'; position: absolute; left: 0; color: \${brightColor}; }
      .highlight { background: rgba(255,255,255,0.03); border: 1px solid \${brightColor}50; padding: 20px 30px; font-size: 26px; font-weight: 700; color: #fff; margin-top: auto; width: 100%; box-sizing: border-box; }
    </style></head><body><div class="card"><div class="content-wrapper">\${texto}</div><div class="footer"><img src="\${logo}" class="logo"></div></div></body></html>\`,

    // VARIANTE 3: COLOR SÓLIDO (Fondo 100% color de la marca)
    \`<!DOCTYPE html><html><head><meta charset="UTF-8">\${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: \${color}; color: \${textColorOnColor}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 70px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; background: transparent; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: space-between; margin-top: 15px; flex-shrink: 0; width: 100%; border-top: 2px solid \${textColorOnColor}40; padding-top: 20px;}
      .logo { max-height: 50px; \${isDark ? 'filter: brightness(0) invert(1);' : 'filter: brightness(0);'} opacity: 0.9; }
      h2 { background-color: \${textColorOnColor}; color: \${color}; padding: 8px 20px; border-radius: 5px; font-size: 22px; font-weight: 900; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; letter-spacing: 2px; }
      h1 { font-size: 55px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: \${textColorOnColor}; }
      p { font-size: 30px; line-height: 1.4; color: \${textColorOnColor}; opacity: 0.9; margin: 0 0 20px 0; font-weight: 500;}
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 700; color: \${textColorOnColor}; }
      li::before { content: '→'; position: absolute; left: 0; color: \${textColorOnColor}; font-weight: bold;}
      .highlight { background: \${textColorOnColor}15; border-radius: 10px; padding: 25px 30px; font-size: 28px; font-weight: 800; color: \${textColorOnColor}; margin-top: auto; width: 100%; box-sizing: border-box; text-align: left; border: 2px solid \${textColorOnColor}40; }
    </style></head><body><div class="card"><div class="content-wrapper">\${texto}</div><div class="footer"><img src="\${logo}" class="logo"></div></div></body></html>\`,

    // VARIANTE 4: MITAD Y MITAD (Split screen)
    \`<!DOCTYPE html><html><head><meta charset="UTF-8">\${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background: linear-gradient(180deg, #ffffff 40%, \${color} 40%); color: #333; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 30px; background: #ffffff; box-shadow: 0 30px 60px rgba(0,0,0,0.3); }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: grayscale(1) contrast(2); opacity: 0.8; }
      h2 { color: #ffffff; background: \${color}; padding: 8px 25px; border-radius: 50px; font-size: 20px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
      h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #000000; }
      p { font-size: 28px; line-height: 1.4; color: #555555; margin: 0 0 20px 0; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 28px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 600; color: #333333; }
      li::before { content: '◆'; position: absolute; left: 0; color: \${color}; font-size: 22px; }
      .highlight { background: rgba(0,0,0,0.03); border: 2px dashed \${color}80; padding: 20px 30px; font-size: 26px; font-weight: 800; color: #000000; margin-top: auto; width: 100%; box-sizing: border-box; text-align: center; border-radius: 15px;}
    </style></head><body><div class="card"><div class="content-wrapper">\${texto}</div><div class="footer"><img src="\${logo}" class="logo"></div></div></body></html>\`,

    // VARIANTE 5: SOFT CREAM / EDITORIAL
    \`<!DOCTYPE html><html><head><meta charset="UTF-8">\${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #F4F0EB; color: #333333; font-family: 'Georgia', serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border: 1px solid #dcd3c6; background: transparent; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: center; align-items: center; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: grayscale(1); opacity: 0.7; }
      h2 { color: \${color}; font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 700; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; letter-spacing: 3px; border-bottom: 1px solid \${color}; padding-bottom: 5px;}
      h1 { font-size: 55px; font-weight: normal; line-height: 1.1; margin: 0 0 20px 0; color: #111111; font-style: italic; }
      p { font-size: 28px; line-height: 1.5; color: #555555; margin: 0 0 20px 0; font-family: 'Montserrat', sans-serif;}
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; text-align: left; display: inline-block; font-family: 'Montserrat', sans-serif;}
      li { font-size: 26px; line-height: 1.5; margin-bottom: 15px; padding-left: 30px; position: relative; font-weight: 500; color: #333333; }
      li::before { content: '—'; position: absolute; left: 0; color: \${color}; font-weight: bold;}
      .highlight { background: #EAE3D9; padding: 25px 40px; font-size: 24px; font-weight: normal; font-style: italic; color: #111111; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 5px; }
    </style></head><body><div class="card"><div class="content-wrapper">\${texto}</div><div class="footer"><img src="\${logo}" class="logo"></div></div></body></html>\`,

    // VARIANTE 6: DARK BRUTALIST (Gigante cuadrado de color detrás)
    \`<!DOCTYPE html><html><head><meta charset="UTF-8">\${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #000000; color: #f5f5f5; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 50px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border: 4px solid #ffffff; background-color: #000000; transform: translate(-20px, -20px); box-shadow: 25px 25px 0px \${color}; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: brightness(0) invert(1); opacity: 0.9; }
      h2 { background-color: #ffffff; color: #000000; padding: 5px 15px; font-size: 22px; font-weight: 900; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
      h1 { font-size: 55px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #ffffff; }
      p { font-size: 30px; line-height: 1.4; color: #dddddd; margin: 0 0 20px 0; font-weight: 500; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 600; color: #ffffff; }
      li::before { content: '►'; position: absolute; left: 0; color: \${color}; }
      .highlight { background: \${color}; color: \${textColorOnColor}; padding: 20px 30px; font-size: 28px; font-weight: 900; margin-top: auto; width: 100%; box-sizing: border-box; text-transform: uppercase; }
    </style></head><body><div class="card"><div class="content-wrapper">\${texto}</div><div class="footer"><img src="\${logo}" class="logo"></div></div></body></html>\`,
    
    // VARIANTE 7: LIGHT MINIMALIST CENTRADO
    \`<!DOCTYPE html><html><head><meta charset="UTF-8">\${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #f0f2f5; color: #1c1e21; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 40px; background: #ffffff; box-shadow: 0 20px 50px rgba(0,0,0,0.08); }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: center; align-items: center; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; }
      .logo { max-height: 50px; filter: grayscale(1) contrast(2); opacity: 0.6; }
      h2 { color: \${color}; padding: 8px 25px; border-radius: 50px; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; background-color: \${color}15; letter-spacing: 1px;}
      h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #000000; text-align: center; }
      p { font-size: 30px; line-height: 1.4; color: #555555; margin: 0 0 20px 0; text-align: center; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; text-align: left; display: inline-block; }
      li { font-size: 28px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 600; color: #333333; }
      li::before { content: '✓'; position: absolute; left: 0; color: \${color}; font-weight: bold; font-size: 32px; line-height: 32px;}
      .highlight { background: transparent; border-top: 2px solid #eeeeee; border-bottom: 2px solid #eeeeee; padding: 25px 30px; font-size: 26px; font-weight: 700; color: #111111; margin-top: auto; text-align: center; width: 100%; box-sizing: border-box; }
    </style></head><body><div class="card"><div class="content-wrapper">\${texto}</div><div class="footer"><img src="\${logo}" class="logo"></div></div></body></html>\`,

    // VARIANTE 8: OSCURO CON FONDO DE IMAGEN TRAMA Y ACENTO ENORME
    \`<!DOCTYPE html><html><head><meta charset="UTF-8">\${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: flex-end; justify-content: center; background-color: #080a0f; background-image: radial-gradient(\${brightColor}20 1px, transparent 1px); background-size: 40px 40px; color: #f5f5f5; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 50px 60px 70px 60px; width: 100%; height: 85%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 40px 40px 0 0; background: linear-gradient(180deg, #111520 0%, #080a0f 100%); border-top: 2px solid \${brightColor}50; border-left: 2px solid \${brightColor}50; border-right: 2px solid \${brightColor}50; box-shadow: 0 -20px 60px rgba(0,0,0,0.8); }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: brightness(0) invert(1); opacity: 0.8; }
      h2 { color: #000000; background: \${brightColor}; padding: 8px 20px; border-radius: 5px; font-size: 20px; font-weight: 900; text-transform: uppercase; margin-bottom: 30px; margin-top: 0; display: inline-block; }
      h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: #ffffff; }
      p { font-size: 30px; line-height: 1.4; color: #cccccc; margin: 0 0 20px 0; font-weight: 500;}
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 500; color: #eeeeee; }
      li::before { content: '➤'; position: absolute; left: 0; color: \${brightColor}; }
      .highlight { background: rgba(0,0,0,0.3); padding: 25px 30px; font-size: 26px; font-weight: 700; color: #ffffff; margin-top: auto; width: 100%; box-sizing: border-box; border-left: 8px solid \${brightColor}; }
    </style></head><body><div class="card"><div class="content-wrapper">\${texto}</div><div class="footer"><img src="\${logo}" class="logo"></div></div></body></html>\`
  ];

  // Elegir una al azar
  return plantillas[Math.floor(Math.random() * plantillas.length)];
}`;

const startIndex = code.indexOf('async function generarPlantillaHTML');
const endIndex = code.indexOf('// ═══════════════════════════════════════════════════════════════\r\n// HELPERS — Firebase Storage');
const endIndex2 = code.indexOf('// ═══════════════════════════════════════════════════════════════\n// HELPERS — Firebase Storage');

let targetEndIndex = endIndex !== -1 ? endIndex : endIndex2;

if (startIndex !== -1 && targetEndIndex !== -1) {
  const newCode = code.substring(0, startIndex) + newFunc + '\n\n' + code.substring(targetEndIndex);
  fs.writeFileSync(file, newCode, 'utf8');
  console.log("REPLACED OK");
} else {
  console.log("COULD NOT FIND INDEXES", startIndex, targetEndIndex);
}
