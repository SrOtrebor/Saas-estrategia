/**
 * imageGenerator.ts
 * ─────────────────────────────────────────────────────────────
 * Motor gráfico avanzado usando Puppeteer y plantillas HTML.
 * Genera imágenes JPG/PNG de 1080×1080 para Instagram (feed/carrusel).
 *
 * Flujo:
 *   1. Selecciona aleatoriamente una de las 8 plantillas premium HTML.
 *   2. Reemplaza variables (textos, logos, colores).
 *   3. Levanta Chromium sin interfaz gráfica (headless) y toma screenshot.
 *   4. Sube a Firebase Storage y retorna URLs.
 * ─────────────────────────────────────────────────────────────
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { IdentidadVisual } from "../interfaces";

const CANVAS_SIZE = 1080;

// ═══════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: generarCarrusel
// ═══════════════════════════════════════════════════════════════

export async function generarCarrusel(
  textos: string[],
  identidad: IdentidadVisual,
  nombreMarca: string,
  idMarca: string,
  idPost: string
): Promise<string[]> {
  const urls: string[] = [];
  const bucket = admin.storage().bucket();
  const totalSlides = Math.min(textos.length, 10);

  // 1. Obtener la plantilla HTML dinámica (sin necesidad de IA real aquí)
  const db = admin.firestore();
  const marcaDoc = await db.collection("marcas").doc(idMarca).get();
  const marcaData = marcaDoc.data() as any;

  let todasLasPlantillas: string[] = [];
  if (marcaData && marcaData.paquetes_asignados && marcaData.paquetes_asignados.length > 0) {
    for (const paqueteId of marcaData.paquetes_asignados) {
      const paqueteDoc = await db.collection("paquetes_plantillas").doc(paqueteId).get();
      if (paqueteDoc.exists) {
        const data = paqueteDoc.data();
        if (data && data.plantillas) {
          todasLasPlantillas = todasLasPlantillas.concat(data.plantillas);
        }
      }
    }
  }

  let customTemplate: string | null = null;
  if (todasLasPlantillas.length > 0) {
    customTemplate = todasLasPlantillas[Math.floor(Math.random() * todasLasPlantillas.length)];
  }

  const plantillaHtml = generarPlantillaHTML(identidad, customTemplate);

  // 2. Levantar Puppeteer para renderizar (Versión Serverless)
  const puppeteer = require("puppeteer-core");
  const chromium = require("@sparticuz/chromium").default || require("@sparticuz/chromium");
  
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });

  try {
    for (let i = 0; i < totalSlides; i++) {
      let textoHtml = textos[i];
      // Adaptar el texto básico (que usa " — " para subtítulos o n) a HTML
      if (!textoHtml.includes("<h") && !textoHtml.includes("<p")) {
        // Separamos el posible título
        const partes = textoHtml.split(" — ");
        if (partes.length > 1) {
          textoHtml = `<h1>${partes[0]}</h1><p>${partes[1].replace(/\n/g, "<br>")}</p>`;
        } else {
          // Intentar adivinar si la primera oración es corta para hacerla título
          const lineas = textoHtml.split("\n");
          if (lineas.length > 1 && lineas[0].length < 60 && !lineas[0].includes(".")) {
            textoHtml = `<h1>${lineas[0]}</h1><p>${lineas.slice(1).join("<br>")}</p>`;
          } else {
            textoHtml = `<p>${textoHtml.replace(/\n/g, "<br>")}</p>`;
          }
        }
      }
      
      const htmlPlaca = plantillaHtml
        .replace(/{{TEXTO}}/g, textoHtml)
        .replace(/{{SLIDE_ACTUAL}}/g, String(i + 1))
        .replace(/{{SLIDE_TOTAL}}/g, String(totalSlides))
        .replace(/{{LOGO_URL}}/g, identidad.logo_url || "");

      const page = await browser.newPage();
      await page.setViewport({ width: CANVAS_SIZE, height: CANVAS_SIZE });
      await page.setContent(htmlPlaca, { waitUntil: "networkidle0" });
      
      const buffer = await page.screenshot({ type: "jpeg", quality: 90 });
      await page.close();

      const fileName = `posts/${idMarca}/${idPost}/slide_${i + 1}.jpg`;
      const publicUrl = await subirConReintentos(bucket, fileName, buffer as Buffer);
      urls.push(publicUrl);

      functions.logger.info(`[imageGenerator] Slide ${i + 1}/${totalSlides} generado: ${publicUrl}`);
    }
  } finally {
    await browser.close();
  }

  return urls;
}

// ═══════════════════════════════════════════════════════════════
// PLANTILLAS HTML
// ═══════════════════════════════════════════════════════════════

function getLuminance(hex: string): number {
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
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function generarPlantillaHTML(identidad: IdentidadVisual, customTemplate: string | null): string {
  const cAccent = identidad.color_primario_hex || "#a28a68";
  const cDark = identidad.color_secundario_hex || "#0e132b";
  const cLight = "#e0e1dd"; // Fijo para mantener contraste
  const cMid = "#39506b"; // Fijo para mantener contraste

  if (customTemplate) {
    let t = customTemplate;
    // Soporte para los placeholders en plantillas cargadas por el usuario
    t = t.replace(/{{COLOR_PRIMARIO}}/g, cAccent);
    t = t.replace(/{{COLOR_SECUNDARIO}}/g, cDark);
    t = t.replace(/{{COLOR_CLARO}}/g, cLight);
    t = t.replace(/{{COLOR_MEDIO}}/g, cMid);
    // {{TEXTO}} y {{LOGO_URL}} se reemplazan luego por slide
    return t;
  }

  const logo = "{{LOGO_URL}}";
  const texto = "{{TEXTO}}";

  const plantillas = [
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 50px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${cLight}; color: ${cDark}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .background-blob { position: absolute; width: 800px; height: 800px; background: radial-gradient(circle, ${cAccent}40 0%, transparent 70%); top: -100px; right: -100px; z-index: 0; filter: blur(50px); }
    .card { z-index: 1; padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 35px; background: ${cLight}90; backdrop-filter: blur(25px); box-shadow: 0 25px 50px -12px ${cDark}20; border-left: 10px solid ${cAccent}; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-end; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.9; }
    h2 { color: ${cAccent}; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 20px; margin-top: 0; display: inline-block; letter-spacing: 2px; border-bottom: 3px solid ${cAccent}; padding-bottom: 5px; }
    h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${cDark}; }
    p { font-size: 28px; line-height: 1.5; color: ${cMid}; margin: 0 0 25px 0; font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 700; color: ${cDark}; }
    li::before { content: '✦'; position: absolute; left: 0; color: ${cAccent}; font-size: 30px; line-height: 38px; }
    .highlight { background: ${cAccent}20; border-left: 6px solid ${cAccent}; padding: 25px 35px; font-size: 26px; font-weight: 700; color: ${cDark}; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 0 15px 15px 0; }
  </style></head><body><div class="background-blob"></div><div class="card"><div class="content-wrapper">{{TEXTO}}</div><div class="footer"><img src="{{LOGO_URL}}" class="logo"></div></div></body></html>`,

    `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${cDark}; color: ${cLight}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 20px; border: 1px solid ${cMid}50; background: linear-gradient(180deg, ${cDark} 0%, ${cMid}40 100%); box-shadow: 0 0 60px ${cMid}30; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; width: 100%; border-top: 1px solid ${cMid}50; padding-top: 20px; }
    .logo { max-height: 50px; opacity: 0.8; filter: brightness(2); }
    h2 { color: ${cDark}; background-color: ${cAccent}; padding: 8px 20px; border-radius: 8px; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; letter-spacing: 1px; }
    h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${cLight}; }
    p { font-size: 28px; line-height: 1.5; color: ${cLight}cc; margin: 0 0 25px 0; font-weight: 500; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 600; color: ${cLight}; }
    li::before { content: '━'; position: absolute; left: 0; color: ${cAccent}; font-weight: bold; }
    .highlight { background: ${cMid}40; border: 1px solid ${cAccent}40; padding: 25px 35px; font-size: 26px; font-weight: 700; color: ${cLight}; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 12px; border-left: 6px solid ${cAccent}; }
  </style></head><body><div class="card"><div class="content-wrapper">{{TEXTO}}</div><div class="footer"><img src="{{LOGO_URL}}" class="logo"></div></div></body></html>`,

    `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${cMid}; color: ${cLight}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 70px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; background: transparent; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: space-between; margin-top: 15px; flex-shrink: 0; width: 100%; border-top: 2px solid ${cDark}30; padding-top: 20px;}
    .logo { max-height: 50px; opacity: 0.9; filter: brightness(2); }
    h2 { background-color: ${cDark}; color: ${cLight}; padding: 10px 25px; border-radius: 50px; font-size: 20px; font-weight: 900; text-transform: uppercase; margin-bottom: 30px; margin-top: 0; letter-spacing: 1px; }
    h1 { font-size: 55px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${cLight}; }
    p { font-size: 30px; line-height: 1.4; color: ${cLight}e6; margin: 0 0 25px 0; font-weight: 500;}
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 700; color: ${cLight}; }
    li::before { content: '→'; position: absolute; left: 0; color: ${cDark}; font-weight: bold;}
    .highlight { background: ${cDark}40; border-radius: 15px; padding: 30px 40px; font-size: 28px; font-weight: 800; color: ${cLight}; margin-top: auto; width: 100%; box-sizing: border-box; text-align: left; border: 2px solid ${cDark}; box-shadow: 10px 10px 0px ${cDark}80; }
  </style></head><body><div class="card"><div class="content-wrapper">{{TEXTO}}</div><div class="footer"><img src="{{LOGO_URL}}" class="logo"></div></div></body></html>`,

    `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, ${cLight} 50%, ${cMid} 50%); color: ${cDark}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 30px; background: ${cLight}; box-shadow: 0 30px 60px ${cDark}50, inset 0 0 0 4px ${cAccent}; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.8; }
    h2 { color: ${cLight}; background: ${cMid}; padding: 10px 25px; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; clip-path: polygon(0 0, 100% 0, 95% 100%, 0% 100%); }
    h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${cDark}; }
    p { font-size: 28px; line-height: 1.5; color: ${cMid}; margin: 0 0 25px 0; font-weight: 600;}
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 700; color: ${cDark}; }
    li::before { content: '◆'; position: absolute; left: 0; color: ${cAccent}; font-size: 24px; }
    .highlight { background: ${cMid}15; border: 2px dashed ${cMid}; padding: 25px 35px; font-size: 26px; font-weight: 800; color: ${cDark}; margin-top: auto; width: 100%; box-sizing: border-box; text-align: center; border-radius: 20px; }
  </style></head><body><div class="card"><div class="content-wrapper">{{TEXTO}}</div><div class="footer"><img src="{{LOGO_URL}}" class="logo"></div></div></body></html>`,

    `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 50px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${cAccent}; color: ${cDark}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; background: transparent; border-top: 5px solid ${cDark}; border-bottom: 5px solid ${cDark}; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: center; align-items: center; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.8; }
    h2 { color: ${cLight}; background-color: ${cDark}; font-size: 20px; font-weight: 700; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; letter-spacing: 4px; padding: 5px 15px; }
    h1 { font-size: 55px; font-weight: 800; line-height: 1.1; margin: 0 0 25px 0; color: ${cDark}; }
    p { font-size: 28px; line-height: 1.5; color: ${cDark}cc; margin: 0 0 25px 0; font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; text-align: left; display: inline-block; }
    li { font-size: 26px; line-height: 1.5; margin-bottom: 15px; padding-left: 35px; position: relative; font-weight: 600; color: ${cDark}; }
    li::before { content: '—'; position: absolute; left: 0; color: ${cLight}; font-weight: bold; }
    .highlight { background: ${cLight}; padding: 30px 45px; font-size: 26px; font-weight: 700; color: ${cDark}; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 100px; }
  </style></head><body><div class="card"><div class="content-wrapper">{{TEXTO}}</div><div class="footer"><img src="{{LOGO_URL}}" class="logo"></div></div></body></html>`,

    `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${cDark}; background-image: radial-gradient(${cMid} 2px, transparent 2px); background-size: 40px 40px; color: ${cLight}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 50px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border: 6px solid ${cAccent}; background-color: ${cDark}; transform: translate(-15px, -15px); box-shadow: 25px 25px 0px ${cAccent}; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.9; filter: brightness(2); }
    h2 { background-color: ${cMid}; color: ${cLight}; padding: 8px 18px; font-size: 22px; font-weight: 900; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
    h1 { font-size: 55px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${cLight}; }
    p { font-size: 30px; line-height: 1.4; color: ${cLight}cc; margin: 0 0 25px 0; font-weight: 500; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 600; color: ${cLight}; }
    li::before { content: '►'; position: absolute; left: 0; color: ${cAccent}; }
    .highlight { background: ${cLight}; color: ${cDark}; padding: 25px 35px; font-size: 28px; font-weight: 900; margin-top: auto; width: 100%; box-sizing: border-box; text-transform: uppercase; border-left: 12px solid ${cAccent}; }
  </style></head><body><div class="card"><div class="content-wrapper">{{TEXTO}}</div><div class="footer"><img src="{{LOGO_URL}}" class="logo"></div></div></body></html>`,

    `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: flex-end; justify-content: center; background-color: ${cLight}; color: ${cLight}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px 70px 80px 70px; width: 100%; height: 88%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 60px 60px 0 0; background: linear-gradient(180deg, ${cMid} 0%, ${cDark} 100%); border-top: 4px solid ${cAccent}; box-shadow: 0 -30px 80px ${cDark}50; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: space-between; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.8; filter: brightness(2); }
    h2 { color: ${cDark}; background: ${cAccent}; padding: 8px 25px; border-radius: 50px; font-size: 18px; font-weight: 900; text-transform: uppercase; margin-bottom: 30px; margin-top: 0; display: inline-block; }
    h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${cLight}; }
    p { font-size: 28px; line-height: 1.5; color: ${cLight}e6; margin: 0 0 25px 0; font-weight: 500;}
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 500; color: ${cLight}; }
    li::before { content: '➤'; position: absolute; left: 0; color: ${cAccent}; }
    .highlight { background: ${cDark}80; padding: 30px 40px; font-size: 26px; font-weight: 700; color: ${cLight}; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 20px; border: 1px solid ${cAccent}50; }
  </style></head><body><div class="card"><div class="content-wrapper">{{TEXTO}}</div><div class="footer"><img src="{{LOGO_URL}}" class="logo"></div></div></body></html>`,

    `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
    body { width: 1080px; height: 1080px; margin: 0; padding: 30px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${cMid}; color: ${cDark}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
    .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 20px; background: ${cLight}; box-shadow: 0 30px 60px ${cDark}80; }
    .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
    .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-end; margin-top: 15px; flex-shrink: 0; width: 100%; }
    .logo { max-height: 50px; opacity: 0.9; }
    h2 { color: ${cMid}; font-size: 20px; font-weight: 800; border-left: 5px solid ${cAccent}; padding-left: 15px; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
    h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: ${cDark}; }
    p { font-size: 28px; line-height: 1.5; color: ${cMid}; margin: 0 0 25px 0; font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 0 0 25px 0; }
    li { font-size: 28px; line-height: 1.5; margin-bottom: 15px; padding-left: 45px; position: relative; font-weight: 700; color: ${cDark}; }
    li::before { content: '✓'; position: absolute; left: 0; color: ${cAccent}; font-weight: bold; font-size: 32px; line-height: 32px;}
    .highlight { background: transparent; border-top: 2px solid ${cAccent}; border-bottom: 2px solid ${cAccent}; padding: 25px 35px; font-size: 26px; font-weight: 700; color: ${cDark}; margin-top: auto; text-align: center; width: 100%; box-sizing: border-box; }
  </style></head><body><div class="card"><div class="content-wrapper">{{TEXTO}}</div><div class="footer"><img src="{{LOGO_URL}}" class="logo"></div></div></body></html>`
  ];

  // Elegir una al azar
  return plantillas[Math.floor(Math.random() * plantillas.length)];
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function subirConReintentos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bucket: any,
  fileName: string,
  buffer: Buffer,
  intentos = 3
): Promise<string> {
  for (let i = 1; i <= intentos; i++) {
    try {
      const file = bucket.file(fileName);
      await file.save(buffer, {
        contentType: "image/jpeg",
        resumable: false,
      });
      await file.makePublic();
      return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    } catch (error) {
      if (i === intentos) throw error;
      await new Promise(res => setTimeout(res, 1000 * i));
    }
  }
  throw new Error("No se pudo subir la imagen");
}
