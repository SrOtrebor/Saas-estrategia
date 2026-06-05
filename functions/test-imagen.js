/**
 * test-imagen.js
 * Prueba local del generador de imágenes Sharp+SVG.
 * Genera 3 slides de carrusel y los guarda en /test-output/
 * Ejecutar con: node test-imagen.js
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const CANVAS_SIZE = 1080;

// Configuración de la marca demo
const identidad = {
  color_primario_hex: "#C8703A",
  color_secundario_hex: "#F5ECD7",
  logo_url: "", // Sin logo para la prueba local
  bannerbear_template_feed_id: "",
  bannerbear_template_story_id: "",
};

const textos = [
  "Nuestras manos, tu pan",
  "Harina pura, de productores locales 🌾",
  "Cada día, recién hecho para vos 🥖",
];

// ─── Helpers ──────────────────────────────────────────────────

function esColorOscuro(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function dividirTexto(texto, maxChars) {
  const palabras = texto.split(" ");
  const lineas = [];
  let lineaActual = "";
  for (const palabra of palabras) {
    if ((lineaActual + " " + palabra).trim().length <= maxChars) {
      lineaActual = (lineaActual + " " + palabra).trim();
    } else {
      if (lineaActual) lineas.push(lineaActual);
      lineaActual = palabra;
    }
  }
  if (lineaActual) lineas.push(lineaActual);
  return lineas;
}

function escaparXML(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function construirSVG(titulo, numeroSlide, totalSlides, colorPrimario, colorSecundario) {
  const isAlternate = numeroSlide % 2 === 0;
  const accentColor = isAlternate ? colorSecundario : colorPrimario;
  const bgColor = isAlternate ? colorPrimario : colorSecundario;
  const textColor = esColorOscuro(bgColor) ? "#FFFFFF" : "#1A1A1A";

  const lineas = dividirTexto(titulo, 20);
  const tituloY = 500;
  const lineHeight = 90;

  const tituloSVG = lineas.map((l, i) =>
    `<text x="540" y="${tituloY + i * lineHeight}"
      font-family="Georgia, serif" font-size="72" font-weight="bold"
      fill="${textColor}" text-anchor="middle">${escaparXML(l)}</text>`
  ).join("\n");

  const indicadores = Array.from({ length: totalSlides }, (_, i) => {
    const cx = 540 - ((totalSlides - 1) * 24) / 2 + i * 24;
    const activo = i === numeroSlide - 1;
    return `<circle cx="${cx}" cy="970" r="${activo ? 9 : 5}"
      fill="${textColor}" fill-opacity="${activo ? 1 : 0.35}" />`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}"
     xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="${bgColor}" />
  <circle cx="900" cy="200" r="280" fill="${accentColor}" fill-opacity="0.12" />
  <circle cx="-60" cy="900" r="220" fill="${accentColor}" fill-opacity="0.08" />
  <rect x="0" y="0" width="${CANVAS_SIZE}" height="8" fill="${accentColor}" />
  <rect x="60" y="200" width="100" height="4" rx="2" fill="${accentColor}" />
  <text x="1020" y="95" font-family="Arial, sans-serif" font-size="26"
    fill="${textColor}" fill-opacity="0.5" text-anchor="end">${numeroSlide}/${totalSlides}</text>
  ${tituloSVG}
  <text x="60" y="1010" font-family="Arial, sans-serif" font-size="26"
    fill="${textColor}" fill-opacity="0.6" font-weight="600">PANADERÍA DEMO</text>
  ${indicadores}
</svg>`;
}

// ─── Generar imágenes ────────────────────────────────────────

async function main() {
  const outDir = path.join(__dirname, "test-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  console.log("\n🎨 Generando slides del carrusel...\n");

  for (let i = 0; i < textos.length; i++) {
    const svg = construirSVG(
      textos[i],
      i + 1,
      textos.length,
      identidad.color_primario_hex,
      identidad.color_secundario_hex
    );

    const outPath = path.join(outDir, `slide_${i + 1}.png`);
    await sharp(Buffer.from(svg)).png({ quality: 90 }).toFile(outPath);
    console.log(`   ✅ Slide ${i + 1}: ${outPath}`);
  }

  console.log(`\n🎉 ¡Carrusel generado! Abrí la carpeta para verlo:`);
  console.log(`   ${outDir}\n`);
}

main().catch(console.error);
