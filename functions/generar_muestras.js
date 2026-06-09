const fs = require('fs');

const fontImport = `<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`;
const navy = "#0e132b";
const light = "#e0e1dd";
const slate = "#39506b";
const gold = "#a28a68";

const logo = "https://via.placeholder.com/200x50/a28a68/0e132b?text=LOGOTIPO+MARCA";
const texto = `
<h2>CRECIMIENTO ESTRATÉGICO</h2>
<h1>¿ESCALAS A CIEGAS?</h1>
<p>La mayoría de los negocios operan sin un sistema predecible de adquisición.</p>
<ul>
  <li>Auditoría de Procesos</li>
  <li>Optimización de Conversión</li>
  <li>Métricas Clave (KPIs)</li>
</ul>
<div class="highlight">Un negocio sin estrategia es solo un pasatiempo caro.</div>
`;

const plantillas = [
  // VARIANTE 1
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 50px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${light}; color: ${navy}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .background-blob { position: absolute; width: 800px; height: 800px; background: radial-gradient(circle, ${gold}40 0%, transparent 70%); top: -100px; right: -100px; z-index: 0; filter: blur(50px); }
    .card { z-index: 1; padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 35px; background: ${light}90; backdrop-filter: blur(25px); box-shadow: 0 25px 50px -12px ${navy}20; border-left: 10px solid ${gold}; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-end; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.9; }
    h2 { color: ${gold}; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 20px; margin-top: 0; display: inline-block; letter-spacing: 2px; border-bottom: 3px solid ${gold}; padding-bottom: 5px; }
    h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${navy}; }
    p { font-size: 28px; line-height: 1.5; color: ${slate}; margin: 0 0 25px 0; font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 700; color: ${navy}; }
    li::before { content: '✦'; position: absolute; left: 0; color: ${gold}; font-size: 30px; line-height: 38px; }
    .highlight { background: ${gold}20; border-left: 6px solid ${gold}; padding: 25px 35px; font-size: 26px; font-weight: 700; color: ${navy}; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 0 15px 15px 0; }
  </style></head><body><div class="background-blob"></div><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,

  // VARIANTE 2
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${navy}; color: ${light}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 20px; border: 1px solid ${slate}50; background: linear-gradient(180deg, ${navy} 0%, ${slate}40 100%); box-shadow: 0 0 60px ${slate}30; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; width: 100%; border-top: 1px solid ${slate}50; padding-top: 20px; }
    .logo { max-height: 50px; opacity: 0.8; filter: brightness(2); }
    h2 { color: ${navy}; background-color: ${gold}; padding: 8px 20px; border-radius: 8px; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; letter-spacing: 1px; }
    h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${light}; }
    p { font-size: 28px; line-height: 1.5; color: ${light}cc; margin: 0 0 25px 0; font-weight: 500; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 600; color: ${light}; }
    li::before { content: '━'; position: absolute; left: 0; color: ${gold}; font-weight: bold; }
    .highlight { background: ${slate}40; border: 1px solid ${gold}40; padding: 25px 35px; font-size: 26px; font-weight: 700; color: ${light}; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 12px; border-left: 6px solid ${gold}; }
  </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,

  // VARIANTE 3
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${slate}; color: ${light}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 70px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; background: transparent; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: space-between; margin-top: 15px; flex-shrink: 0; width: 100%; border-top: 2px solid ${navy}30; padding-top: 20px;}
    .logo { max-height: 50px; opacity: 0.9; filter: brightness(2); }
    h2 { background-color: ${navy}; color: ${light}; padding: 10px 25px; border-radius: 50px; font-size: 20px; font-weight: 900; text-transform: uppercase; margin-bottom: 30px; margin-top: 0; letter-spacing: 1px; }
    h1 { font-size: 55px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${light}; }
    p { font-size: 30px; line-height: 1.4; color: ${light}e6; margin: 0 0 25px 0; font-weight: 500;}
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 700; color: ${light}; }
    li::before { content: '→'; position: absolute; left: 0; color: ${navy}; font-weight: bold;}
    .highlight { background: ${navy}40; border-radius: 15px; padding: 30px 40px; font-size: 28px; font-weight: 800; color: ${light}; margin-top: auto; width: 100%; box-sizing: border-box; text-align: left; border: 2px solid ${navy}; box-shadow: 10px 10px 0px ${navy}80; }
  </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,

  // VARIANTE 4
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, ${light} 50%, ${slate} 50%); color: ${navy}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 30px; background: ${light}; box-shadow: 0 30px 60px ${navy}50, inset 0 0 0 4px ${gold}; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.8; }
    h2 { color: ${light}; background: ${slate}; padding: 10px 25px; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; clip-path: polygon(0 0, 100% 0, 95% 100%, 0% 100%); }
    h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${navy}; }
    p { font-size: 28px; line-height: 1.5; color: ${slate}; margin: 0 0 25px 0; font-weight: 600;}
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 700; color: ${navy}; }
    li::before { content: '◆'; position: absolute; left: 0; color: ${gold}; font-size: 24px; }
    .highlight { background: ${slate}15; border: 2px dashed ${slate}; padding: 25px 35px; font-size: 26px; font-weight: 800; color: ${navy}; margin-top: auto; width: 100%; box-sizing: border-box; text-align: center; border-radius: 20px; }
  </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,

  // VARIANTE 5
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 50px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${gold}; color: ${navy}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; background: transparent; border-top: 5px solid ${navy}; border-bottom: 5px solid ${navy}; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: center; align-items: center; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.8; }
    h2 { color: ${light}; background-color: ${navy}; font-size: 20px; font-weight: 700; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; letter-spacing: 4px; padding: 5px 15px; }
    h1 { font-size: 55px; font-weight: 800; line-height: 1.1; margin: 0 0 25px 0; color: ${navy}; }
    p { font-size: 28px; line-height: 1.5; color: ${navy}cc; margin: 0 0 25px 0; font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; text-align: left; display: inline-block; }
    li { font-size: 26px; line-height: 1.5; margin-bottom: 15px; padding-left: 35px; position: relative; font-weight: 600; color: ${navy}; }
    li::before { content: '—'; position: absolute; left: 0; color: ${light}; font-weight: bold; }
    .highlight { background: ${light}; padding: 30px 45px; font-size: 26px; font-weight: 700; color: ${navy}; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 100px; }
  </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,

  // VARIANTE 6
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${navy}; background-image: radial-gradient(${slate} 2px, transparent 2px); background-size: 40px 40px; color: ${light}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 50px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border: 6px solid ${gold}; background-color: ${navy}; transform: translate(-15px, -15px); box-shadow: 25px 25px 0px ${gold}; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.9; filter: brightness(2); }
    h2 { background-color: ${slate}; color: ${light}; padding: 8px 18px; font-size: 22px; font-weight: 900; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
    h1 { font-size: 55px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${light}; }
    p { font-size: 30px; line-height: 1.4; color: ${light}cc; margin: 0 0 25px 0; font-weight: 500; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 600; color: ${light}; }
    li::before { content: '►'; position: absolute; left: 0; color: ${gold}; }
    .highlight { background: ${light}; color: ${navy}; padding: 25px 35px; font-size: 28px; font-weight: 900; margin-top: auto; width: 100%; box-sizing: border-box; text-transform: uppercase; border-left: 12px solid ${gold}; }
  </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,

  // VARIANTE 7
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: flex-end; justify-content: center; background-color: ${light}; color: ${light}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px 70px 80px 70px; width: 100%; height: 88%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 60px 60px 0 0; background: linear-gradient(180deg, ${slate} 0%, ${navy} 100%); border-top: 4px solid ${gold}; box-shadow: 0 -30px 80px ${navy}50; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: space-between; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.8; filter: brightness(2); }
    h2 { color: ${navy}; background: ${gold}; padding: 8px 25px; border-radius: 50px; font-size: 18px; font-weight: 900; text-transform: uppercase; margin-bottom: 30px; margin-top: 0; display: inline-block; }
    h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${light}; }
    p { font-size: 28px; line-height: 1.5; color: ${light}e6; margin: 0 0 25px 0; font-weight: 500;}
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 500; color: ${light}; }
    li::before { content: '➤'; position: absolute; left: 0; color: ${gold}; }
    .highlight { background: ${navy}80; padding: 30px 40px; font-size: 26px; font-weight: 700; color: ${light}; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 20px; border: 1px solid ${gold}50; }
  </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,

  // VARIANTE 8
  `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 30px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${slate}; color: ${navy}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 20px; background: ${light}; box-shadow: 0 30px 60px ${navy}80; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-end; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.9; }
    h2 { color: ${slate}; font-size: 20px; font-weight: 800; border-left: 5px solid ${gold}; padding-left: 15px; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
    h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${navy}; }
    p { font-size: 28px; line-height: 1.5; color: ${slate}; margin: 0 0 25px 0; font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 700; color: ${navy}; }
    li::before { content: '✓'; position: absolute; left: 0; color: ${gold}; font-weight: bold; font-size: 32px; line-height: 32px;}
    .highlight { background: transparent; border-top: 2px solid ${gold}; border-bottom: 2px solid ${gold}; padding: 25px 35px; font-size: 26px; font-weight: 700; color: ${navy}; margin-top: auto; text-align: center; width: 100%; box-sizing: border-box; }
  </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`
];

let htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>8 Diseños Premium - SaaS Estrategias</title>
<style>
  body { background: #0e132b; color: #e0e1dd; font-family: 'Montserrat', sans-serif; display: flex; flex-wrap: wrap; justify-content: center; gap: 40px; padding: 40px; }
  h1 { width: 100%; text-align: center; color: #a28a68; margin-bottom: 10px; font-size: 40px; }
  .desc { width: 100%; text-align: center; margin-bottom: 40px; font-size: 18px; color: #e0e1dd; opacity: 0.8; }
  .preview { display: flex; flex-direction: column; align-items: center; }
  .preview h3 { margin-bottom: 20px; color: #a28a68; font-size: 20px; }
  .iframe-container { width: 1080px; height: 1080px; transform: scale(0.35); transform-origin: top center; margin-bottom: -700px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); border-radius: 20px; overflow: hidden; background: #fff; }
  iframe { width: 100%; height: 100%; border: none; }
</style>
</head>
<body>
  <h1>Tus 8 Diseños Premium</h1>
  <div class="desc">Haz clic en cualquier imagen o simplemente míralas aquí. Estos diseños se irán rotando automáticamente.</div>
`;

const nombres = [
  "1. Elegancia Clara y Dorada",
  "2. Oscuro Profundo y Glow",
  "3. Slate Moderno",
  "4. Mitad y Mitad",
  "5. Impacto Dorado",
  "6. Brutalista Tecnológico",
  "7. Ola Inversa Elegante",
  "8. Marco Estructurado"
];

plantillas.forEach((p, index) => {
  const base64Html = Buffer.from(p).toString('base64');
  const dataUri = "data:text/html;base64," + base64Html;
  htmlContent += `
  <div class="preview">
    <h3>` + nombres[index] + `</h3>
    <div class="iframe-container">
      <iframe src="` + dataUri + `"></iframe>
    </div>
  </div>
  `;
});

htmlContent += "</body></html>";

fs.writeFileSync('../muestras_diseños.html', htmlContent);
console.log('Archivo de muestras generado en E:\\SaaS-estrategias\\muestras_diseños.html');
