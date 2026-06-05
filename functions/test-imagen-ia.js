/**
 * test-imagen-ia.js
 * Genera fondos con Google Imagen 4 Fast via AI Studio API.
 * Superpone branding de marca con Sharp.
 * Ejecutar con: node test-imagen-ia.js
 */

require("dotenv").config({ path: "./.env" });
const { GoogleGenAI } = require("@google/genai");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const marca = {
  nombre_comercial: "Panadería Demo",
  color_primario_hex: "#C8703A",
};

const slides = [
  {
    texto: "Nuestras manos, tu pan",
    prompt: "artisan baker hands kneading bread dough rustic wooden table warm golden morning light cinematic food photography no text no faces",
  },
  {
    texto: "Harina pura de productores locales",
    prompt: "golden wheat field at sunrise shallow depth of field warm amber tones cinematic landscape no text",
  },
  {
    texto: "Recién hecho para vos, cada mañana",
    prompt: "fresh sourdough bread loaves wooden bakery shelf warm morning window light food photography no text",
  },
];

// ─── Helpers ─────────────────────────────────────────────────

function escaparXML(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dividirTexto(texto, maxChars) {
  const palabras = texto.split(" ");
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    if ((actual + " " + p).trim().length <= maxChars) {
      actual = (actual + " " + p).trim();
    } else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function construirOverlay(texto, n, total, color, nombre) {
  const lineas = dividirTexto(texto, 20);
  const y0 = 600, lh = 90;
  const textoSVG = lineas.map((l, i) =>
    `<text x="540" y="${y0 + i * lh}"
      font-family="Georgia, serif" font-size="74" font-weight="bold"
      fill="#FFF" text-anchor="middle" filter="url(#s)">${escaparXML(l)}</text>`
  ).join("\n");
  const puntos = Array.from({ length: total }, (_, i) => {
    const cx = 540 - ((total - 1) * 26) / 2 + i * 26;
    return `<circle cx="${cx}" cy="978" r="${i === n - 1 ? 9 : 5}"
      fill="#FFF" fill-opacity="${i === n - 1 ? 1 : 0.5}" />`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="s"><feDropShadow dx="0" dy="3" stdDeviation="10" flood-color="#000" flood-opacity="0.8"/></filter>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="40%" stop-color="#000" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.78"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#g)"/>
  <rect x="0" y="0" width="1080" height="8" fill="${color}"/>
  <rect x="928" y="52" width="104" height="42" rx="21" fill="#000" fill-opacity="0.4"/>
  <text x="980" y="80" font-family="Arial, sans-serif" font-size="22" font-weight="600"
    fill="#FFF" text-anchor="middle">${n}/${total}</text>
  ${textoSVG}
  <text x="60" y="1018" font-family="Arial, sans-serif" font-size="26" font-weight="700"
    fill="#FFF" fill-opacity="0.92" letter-spacing="3" filter="url(#s)">${escaparXML(nombre.toUpperCase())}</text>
  ${puntos}
</svg>`;
}

// ─── Generar fondo con Imagen 4 ───────────────────────────────

async function generarFondo(prompt) {
  const response = await ai.models.generateImages({
    model: "imagen-4.0-fast-generate-001",
    prompt,
    config: {
      numberOfImages: 1,
      outputMimeType: "image/jpeg",
      aspectRatio: "1:1",
    },
  });
  const bytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!bytes) throw new Error("Respuesta vacía de Imagen 4");
  return Buffer.from(bytes, "base64");
}

// ─── Generar slide completo ───────────────────────────────────

async function generarSlide(slide, index, total, outDir) {
  console.log(`\n   🎨 Slide ${index + 1}/${total}: "${slide.texto}"`);
  console.log(`   🤖 Generando fondo con Imagen 4 Fast...`);

  let fondoBuffer;
  try {
    fondoBuffer = await generarFondo(slide.prompt);
    console.log(`   ✅ Fondo generado (${Math.round(fondoBuffer.length / 1024)} KB)`);
  } catch (err) {
    console.error(`   ❌ Error Imagen 4: ${err.message?.substring(0, 120)}`);
    console.log(`   🔄 Usando fondo de color de marca...`);
    fondoBuffer = await sharp({
      create: { width: 1080, height: 1080, channels: 3, background: { r: 200, g: 112, b: 58 } },
    }).jpeg().toBuffer();
  }

  const fondo = await sharp(fondoBuffer).resize(1080, 1080, { fit: "cover" }).toBuffer();
  const overlay = Buffer.from(construirOverlay(slide.texto, index + 1, total, marca.color_primario_hex, marca.nombre_comercial));

  const final = await sharp(fondo)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png({ quality: 92 })
    .toBuffer();

  const outPath = path.join(outDir, `slide_ia_${index + 1}.png`);
  fs.writeFileSync(outPath, final);
  console.log(`   💾 ${outPath}`);
  return outPath;
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const outDir = path.join(__dirname, "test-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  console.log("\n🚀 Generando carrusel con Google Imagen 4 Fast...");
  console.log(`   Marca: ${marca.nombre_comercial} | Slides: ${slides.length}`);
  console.log(`   Costo estimado: $${(slides.length * 0.004).toFixed(3)} USD\n`);

  for (let i = 0; i < slides.length; i++) {
    await generarSlide(slides[i], i, slides.length, outDir);
  }

  console.log("\n🎉 ¡Carrusel generado!");
  for (let i = 1; i <= slides.length; i++) {
    console.log(`   → test-output/slide_ia_${i}.png`);
  }
  console.log();
}

main().catch(console.error);
