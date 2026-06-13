"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarMuestrarioPlantillas = generarMuestrarioPlantillas;
exports.generarCarrusel = generarCarrusel;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const CANVAS_SIZE = 1080;
// ═══════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: generarCarrusel
// ═══════════════════════════════════════════════════════════════
async function generarMuestrarioPlantillas(identidad, idMarca) {
    const urls = [];
    const bucket = admin.storage().bucket();
    const db = admin.firestore();
    const marcaDoc = await db.collection("marcas").doc(idMarca).get();
    const marcaData = marcaDoc.data();
    let todasLasPlantillas = [];
    if (marcaData && marcaData.plantillas && marcaData.plantillas.length > 0) {
        todasLasPlantillas = marcaData.plantillas;
    }
    // Obtenemos el array con las versiones inyectadas (con colores de la marca)
    const plantillasList = obtenerTodasLasPlantillasHTML(todasLasPlantillas);
    if (plantillasList.length === 0) {
        return [];
    }
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
        const textoHtml = `<h2>TÍTULO DE MUESTRA</h2><p>Así es como se ve un párrafo dentro de este diseño. Se probará con tus colores.</p><ul><li>Punto a destacar</li><li>Otro punto importante</li></ul><div class="highlight">Mensaje destacado en la parte inferior</div>`;
        for (let i = 0; i < plantillasList.length; i++) {
            const colorPrimario = identidad.color_primario_hex || "#a28a68";
            const colorSecundario = identidad.color_secundario_hex || "#0e132b";
            const colorClaro = "#e0e1dd";
            const colorMedio = "#39506b";
            let htmlPlaca = plantillasList[i]
                .replace(/{{TEXTO}}/g, textoHtml)
                .replace(/\$\{texto\}/g, textoHtml)
                .replace(/{{SLIDE_ACTUAL}}/g, "1")
                .replace(/{{SLIDE_TOTAL}}/g, "1")
                .replace(/{{LOGO_URL}}/g, identidad.logo_url || "")
                .replace(/\$\{logo\}/g, identidad.logo_url || "")
                .replace(/{{COLOR_PRIMARIO}}/g, colorPrimario)
                .replace(/{{COLOR_SECUNDARIO}}/g, colorSecundario)
                .replace(/{{COLOR_CLARO}}/g, colorClaro)
                .replace(/{{COLOR_MEDIO}}/g, colorMedio)
                .replace(/\$\{color\}/g, colorPrimario)
                .replace(/\$\{color_primario\}/g, colorPrimario)
                .replace(/\$\{color_secundario\}/g, colorSecundario)
                .replace(/\$\{color_claro\}/g, colorClaro)
                .replace(/\$\{color_medio\}/g, colorMedio);
            const page = await browser.newPage();
            await page.setViewport({ width: CANVAS_SIZE, height: CANVAS_SIZE });
            await page.setJavaScriptEnabled(false);
            await page.setContent(htmlPlaca, { waitUntil: "domcontentloaded" });
            const buffer = await page.screenshot({ type: "jpeg", quality: 80 });
            await page.close();
            const fileName = `posts/${idMarca}/muestrario/plantilla_${i + 1}_${Date.now()}.jpg`;
            const publicUrl = await subirConReintentos(bucket, fileName, buffer);
            urls.push(publicUrl);
        }
    }
    finally {
        await browser.close();
    }
    return urls;
}
// ═══════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: generarCarrusel
// ═══════════════════════════════════════════════════════════════
async function generarCarrusel(textos, identidad, nombreMarca, idMarca, idPost) {
    const urls = [];
    const bucket = admin.storage().bucket();
    const totalSlides = Math.min(textos.length, 10);
    // 1. Obtener la plantilla HTML dinámica (sin necesidad de IA real aquí)
    const db = admin.firestore();
    const marcaDoc = await db.collection("marcas").doc(idMarca).get();
    const marcaData = marcaDoc.data();
    let todasLasPlantillas = [];
    if (marcaData && marcaData.plantillas && marcaData.plantillas.length > 0) {
        todasLasPlantillas = marcaData.plantillas;
    }
    if (todasLasPlantillas.length === 0) {
        return [];
    }
    const plantillaHtml = generarPlantillaHTML(identidad, todasLasPlantillas);
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
                }
                else {
                    // Intentar adivinar si la primera oración es corta para hacerla título
                    const lineas = textoHtml.split("\n");
                    if (lineas.length > 1 && lineas[0].length < 60 && !lineas[0].includes(".")) {
                        textoHtml = `<h1>${lineas[0]}</h1><p>${lineas.slice(1).join("<br>")}</p>`;
                    }
                    else {
                        textoHtml = `<p>${textoHtml.replace(/\n/g, "<br>")}</p>`;
                    }
                }
            }
            const colorPrimario = identidad.color_primario_hex || "#a28a68";
            const colorSecundario = identidad.color_secundario_hex || "#0e132b";
            const colorClaro = "#e0e1dd";
            const colorMedio = "#39506b";
            const htmlPlaca = plantillaHtml
                .replace(/{{TEXTO}}/g, textoHtml)
                .replace(/\$\{texto\}/g, textoHtml)
                .replace(/{{SLIDE_ACTUAL}}/g, String(i + 1))
                .replace(/{{SLIDE_TOTAL}}/g, String(totalSlides))
                .replace(/{{LOGO_URL}}/g, identidad.logo_url || "")
                .replace(/\$\{logo\}/g, identidad.logo_url || "")
                .replace(/{{COLOR_PRIMARIO}}/g, colorPrimario)
                .replace(/{{COLOR_SECUNDARIO}}/g, colorSecundario)
                .replace(/{{COLOR_CLARO}}/g, colorClaro)
                .replace(/{{COLOR_MEDIO}}/g, colorMedio)
                .replace(/\$\{color\}/g, colorPrimario)
                .replace(/\$\{color_primario\}/g, colorPrimario)
                .replace(/\$\{color_secundario\}/g, colorSecundario)
                .replace(/\$\{color_claro\}/g, colorClaro)
                .replace(/\$\{color_medio\}/g, colorMedio);
            const page = await browser.newPage();
            await page.setViewport({ width: CANVAS_SIZE, height: CANVAS_SIZE });
            // Seguridad: deshabilitar JS para evitar SSRF desde plantillas HTML externas
            await page.setJavaScriptEnabled(false);
            await page.setContent(htmlPlaca, { waitUntil: "domcontentloaded" });
            const buffer = await page.screenshot({ type: "jpeg", quality: 90 });
            await page.close();
            const fileName = `posts/${idMarca}/${idPost}/slide_${i + 1}.jpg`;
            const publicUrl = await subirConReintentos(bucket, fileName, buffer);
            urls.push(publicUrl);
            functions.logger.info(`[imageGenerator] Slide ${i + 1}/${totalSlides} generado: ${publicUrl}`);
        }
    }
    finally {
        await browser.close();
    }
    return urls;
}
// ═══════════════════════════════════════════════════════════════
// PLANTILLAS HTML
// ═══════════════════════════════════════════════════════════════
function getLuminance(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function getBrightColor(hex) {
    if (getLuminance(hex) > 0.4)
        return hex;
    const h = hex.replace("#", "");
    let r = parseInt(h.substring(0, 2), 16) || 0;
    let g = parseInt(h.substring(2, 4), 16) || 0;
    let b = parseInt(h.substring(4, 6), 16) || 0;
    r = Math.min(255, Math.floor(r + (255 - r) * 0.6));
    g = Math.min(255, Math.floor(g + (255 - g) * 0.6));
    b = Math.min(255, Math.floor(b + (255 - b) * 0.6));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
function obtenerTodasLasPlantillasHTML(customTemplates) {
    if (customTemplates && customTemplates.length > 0) {
        return [...customTemplates];
    }
    return [];
}
function generarPlantillaHTML(identidad, customTemplates) {
    const list = obtenerTodasLasPlantillasHTML(customTemplates);
    return list[Math.floor(Math.random() * list.length)];
}
// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
async function subirConReintentos(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
bucket, fileName, buffer, intentos = 3) {
    for (let i = 1; i <= intentos; i++) {
        try {
            const file = bucket.file(fileName);
            await file.save(buffer, {
                contentType: "image/jpeg",
                resumable: false,
            });
            await file.makePublic();
            return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        }
        catch (error) {
            if (i === intentos)
                throw error;
            await new Promise(res => setTimeout(res, 1000 * i));
        }
    }
    throw new Error("No se pudo subir la imagen");
}
//# sourceMappingURL=imageGenerator.js.map