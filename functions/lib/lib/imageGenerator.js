"use strict";
/**
 * imageGenerator.ts
 * ─────────────────────────────────────────────────────────────
 * Motor gráfico gratuito usando Sharp + SVG.
 * Genera imágenes PNG de 1080×1080 para Instagram (feed/carrusel).
 *
 * Flujo:
 *   1. Construir SVG con colores de marca, textos y logo
 *   2. Sharp convierte SVG → PNG
 *   3. Subir a Firebase Storage
 *   4. Retornar URL pública
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarSlide = generarSlide;
exports.generarCarrusel = generarCarrusel;
const sharp_1 = __importDefault(require("sharp"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const axios_1 = __importDefault(require("axios"));
const CANVAS_SIZE = 1080; // px — formato cuadrado Instagram 1:1
/**
 * Genera un PNG de 1080×1080 para un slide de carrusel.
 * @returns Buffer PNG listo para subir a Storage
 */
async function generarSlide(config) {
    const { titulo, subtitulo, numeroSlide, totalSlides, identidad, nombreMarca, } = config;
    // Descargar el logo y convertirlo a base64 para embeber en SVG
    let logoBase64 = "";
    let logoMimeType = "image/png";
    try {
        const logoRes = await axios_1.default.get(identidad.logo_url, {
            responseType: "arraybuffer",
            timeout: 8000,
        });
        logoBase64 = Buffer.from(logoRes.data).toString("base64");
        const rawType = logoRes.headers["content-type"];
        logoMimeType = typeof rawType === "string" ? rawType : "image/png";
    }
    catch {
        functions.logger.warn("[imageGenerator] No se pudo cargar el logo, se omitirá.");
    }
    const logoSrc = logoBase64
        ? `data:${logoMimeType};base64,${logoBase64}`
        : "";
    // Determinar si el slide usa layout alternado (impar/par)
    const isAlternate = numeroSlide % 2 === 0;
    const svg = construirSVG({
        titulo,
        subtitulo,
        numeroSlide,
        totalSlides,
        nombreMarca,
        colorPrimario: identidad.color_primario_hex,
        colorSecundario: identidad.color_secundario_hex,
        logoSrc,
        isAlternate,
    });
    // Convertir SVG a PNG con Sharp
    const pngBuffer = await (0, sharp_1.default)(Buffer.from(svg))
        .png({ quality: 90 })
        .toBuffer();
    return pngBuffer;
}
/**
 * Genera todos los slides de un carrusel y los sube a Firebase Storage.
 * @returns Array de URLs públicas de las imágenes generadas
 */
async function generarCarrusel(textos, identidad, nombreMarca, idMarca, idPost) {
    const urls = [];
    const bucket = admin.storage().bucket();
    for (let i = 0; i < textos.length; i++) {
        const partes = textos[i].split(" — ");
        const titulo = partes[0] || textos[i];
        const subtitulo = partes[1] || undefined;
        const pngBuffer = await generarSlide({
            titulo,
            subtitulo,
            numeroSlide: i + 1,
            totalSlides: textos.length,
            identidad,
            nombreMarca,
        });
        // Subir a Firebase Storage
        const filePath = `posts/${idMarca}/${idPost}/slide_${i + 1}.png`;
        const file = bucket.file(filePath);
        await file.save(pngBuffer, {
            metadata: { contentType: "image/png" },
            public: true,
        });
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        urls.push(publicUrl);
        functions.logger.info(`[imageGenerator] Slide ${i + 1}/${textos.length} generado: ${publicUrl}`);
    }
    return urls;
}
function construirSVG(p) {
    // Calcular color de texto contrastante
    const textColor = esColorOscuro(p.colorPrimario) ? "#FFFFFF" : "#1A1A1A";
    const accentColor = p.isAlternate ? p.colorSecundario : p.colorPrimario;
    const bgColor = p.isAlternate ? p.colorPrimario : p.colorSecundario;
    const textColorFinal = p.isAlternate
        ? (esColorOscuro(p.colorPrimario) ? "#FFFFFF" : "#1A1A1A")
        : (esColorOscuro(p.colorSecundario) ? "#FFFFFF" : "#1A1A1A");
    // Dividir el título en líneas si es muy largo
    const lineasTitulo = dividirTexto(p.titulo, 22);
    const tituloY = p.subtitulo ? 420 : 480;
    const lineHeight = 85;
    const tituloSVG = lineasTitulo
        .map((linea, i) => `<text x="540" y="${tituloY + i * lineHeight}"
          font-family="Georgia, 'Times New Roman', serif"
          font-size="68"
          font-weight="bold"
          fill="${textColorFinal}"
          text-anchor="middle"
          dominant-baseline="middle">${escaparXML(linea)}</text>`)
        .join("\n");
    const subtituloSVG = p.subtitulo
        ? `<text x="540" y="${tituloY + lineasTitulo.length * lineHeight + 40}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="36"
        fill="${textColorFinal}"
        fill-opacity="0.75"
        text-anchor="middle"
        dominant-baseline="middle">${escaparXML(p.subtitulo)}</text>`
        : "";
    const logoSVG = p.logoSrc
        ? `<image href="${p.logoSrc}" x="60" y="60" width="120" height="120"
        preserveAspectRatio="xMidYMid meet" />`
        : `<text x="80" y="120"
        font-family="Arial, sans-serif"
        font-size="28"
        font-weight="bold"
        fill="${textColorFinal}">${escaparXML(p.nombreMarca)}</text>`;
    // Indicador de slide (puntos)
    const indicadores = Array.from({ length: p.totalSlides }, (_, i) => {
        const cx = 540 - ((p.totalSlides - 1) * 22) / 2 + i * 22;
        const isActivo = i === p.numeroSlide - 1;
        return `<circle cx="${cx}" cy="970" r="${isActivo ? 8 : 5}"
      fill="${textColorFinal}" fill-opacity="${isActivo ? 1 : 0.35}" />`;
    }).join("\n");
    // Decoración geométrica
    const decoracion = p.isAlternate
        ? `<rect x="0" y="800" width="1080" height="200" fill="${accentColor}" fill-opacity="0.15" />`
        : `<circle cx="900" cy="200" r="250" fill="${accentColor}" fill-opacity="0.12" />
       <circle cx="-80" cy="900" r="200" fill="${accentColor}" fill-opacity="0.08" />`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"
     viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}"
     xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink">

  <!-- Fondo base -->
  <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="${bgColor}" />

  <!-- Decoración geométrica -->
  ${decoracion}

  <!-- Franja superior de color -->
  <rect x="0" y="0" width="${CANVAS_SIZE}" height="8" fill="${accentColor}" />

  <!-- Logo de la marca -->
  ${logoSVG}

  <!-- Número de slide (top right) -->
  <text x="1020" y="95"
    font-family="Arial, sans-serif"
    font-size="24"
    fill="${textColorFinal}"
    fill-opacity="0.5"
    text-anchor="end">${p.numeroSlide}/${p.totalSlides}</text>

  <!-- Línea decorativa -->
  <rect x="60" y="220" width="120" height="4" rx="2" fill="${accentColor}" />

  <!-- Título principal -->
  ${tituloSVG}

  <!-- Subtítulo -->
  ${subtituloSVG}

  <!-- Nombre de la marca (footer) -->
  <text x="60" y="1010"
    font-family="Arial, Helvetica, sans-serif"
    font-size="26"
    fill="${textColorFinal}"
    fill-opacity="0.6"
    font-weight="600">${escaparXML(p.nombreMarca.toUpperCase())}</text>

  <!-- Indicadores de slide -->
  ${indicadores}

</svg>`;
}
// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
/** Determina si un color HEX es oscuro (para elegir texto blanco o negro) */
function esColorOscuro(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    // Fórmula de luminancia perceptual
    const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminancia < 0.5;
}
/** Divide un texto en líneas de máximo `maxChars` caracteres */
function dividirTexto(texto, maxChars) {
    const palabras = texto.split(" ");
    const lineas = [];
    let lineaActual = "";
    for (const palabra of palabras) {
        if ((lineaActual + " " + palabra).trim().length <= maxChars) {
            lineaActual = (lineaActual + " " + palabra).trim();
        }
        else {
            if (lineaActual)
                lineas.push(lineaActual);
            lineaActual = palabra;
        }
    }
    if (lineaActual)
        lineas.push(lineaActual);
    return lineas;
}
/** Escapa caracteres especiales XML en strings de texto */
function escaparXML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
//# sourceMappingURL=imageGenerator.js.map