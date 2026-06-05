"use strict";
/**
 * generarContenidoEspontaneo.ts
 * ─────────────────────────────────────────────────────────────
 * Trigger Firestore: se dispara cuando se crea un doc en /cola_ingesta.
 *
 * Flujo:
 *   1. Lee la ingesta y la config de la marca
 *   2. Gemini 2.5 Flash → genera copy, hashtags, textos de slides
 *   3. Imagen 4 Fast → genera fondo fotográfico por slide
 *   4. Sharp → compone la imagen final (fondo + overlay SVG)
 *   5. Firebase Storage → sube los PNGs
 *   6. Firestore → guarda el post en /planificador_contenido
 *   7. Telegram → envía el carrusel completo al cliente para revisión
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
exports.generarContenidoEspontaneo = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const axios_1 = __importDefault(require("axios"));
const genai_1 = require("@google/genai");
const sharp_1 = __importDefault(require("sharp"));
const googleSheets_1 = require("../lib/googleSheets");
// ═══════════════════════════════════════════════════════════════
// CLOUD FUNCTION: generarContenidoEspontaneo
// Trigger: onCreate en /cola_ingesta/{id}
// ═══════════════════════════════════════════════════════════════
exports.generarContenidoEspontaneo = functions
    .runWith({ timeoutSeconds: 300, memory: "1GB" })
    .firestore.document("cola_ingesta/{ingestaId}")
    .onCreate(async (snap, context) => {
    const ingestaId = context.params.ingestaId;
    const ingesta = snap.data();
    functions.logger.info(`[espontaneo] Procesando ingesta ${ingestaId} para marca ${ingesta.id_marca}`);
    const db = admin.firestore();
    // ─── Paso 1: Obtener config de la marca ──────────────────
    const marcaDoc = await db.collection("marcas").doc(ingesta.id_marca).get();
    if (!marcaDoc.exists) {
        functions.logger.error(`[espontaneo] Marca ${ingesta.id_marca} no encontrada.`);
        return;
    }
    const marca = marcaDoc.data();
    const chatId = marca.credenciales_redes?.telegram_chat_id;
    // ─── Paso 2: Generar copy con Gemini 2.5 Flash ───────────
    functions.logger.info("[espontaneo] Generando copy con Gemini...");
    const ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = construirPrompt(marca, ingesta);
    const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" },
    });
    let contenidoIA;
    try {
        contenidoIA = JSON.parse(geminiResponse.text ?? "{}");
    }
    catch {
        functions.logger.error("[espontaneo] Error parseando JSON de Gemini:", geminiResponse.text);
        throw new Error("Respuesta de Gemini no es JSON válido");
    }
    functions.logger.info(`[espontaneo] Copy generado: "${contenidoIA.titulo_gancho}"`);
    // ─── Paso 3: Generar slides (fondo IA + overlay SVG) ─────
    const slides = contenidoIA.textos_capas_graficas ?? [contenidoIA.titulo_gancho];
    const totalSlides = Math.min(slides.length, 7);
    const imageUrls = [];
    for (let i = 0; i < totalSlides; i++) {
        functions.logger.info(`[espontaneo] Generando slide ${i + 1}/${totalSlides}...`);
        const fondoBuffer = await generarFondoImagen4(ai, generarPromptFondo(slides[i], marca.datos_negocio.rubro));
        const slideBuffer = await componerSlide(fondoBuffer, slides[i], i + 1, totalSlides, marca.identidad_visual.color_primario_hex, marca.nombre_comercial, marca.identidad_visual.logo_url);
        // Subir a Firebase Storage con reintentos
        const bucket = admin.storage().bucket();
        const fileName = `posts/${ingesta.id_marca}/${ingestaId}/slide_${i + 1}.png`;
        const publicUrl = await subirConReintentos(bucket, fileName, slideBuffer);
        imageUrls.push(publicUrl);
        functions.logger.info(`[espontaneo] Slide ${i + 1} subido: ${publicUrl}`);
    }
    // ─── Paso 4: Guardar en planificador_contenido ───────────
    const ahora = firestore_1.Timestamp.now();
    const post = {
        id_marca: ingesta.id_marca,
        origen: "input_espontaneo",
        fecha_hora_sugerida: ahora,
        formato: "CARRUSEL",
        estado: "PENDIENTE",
        contexto_input: ingesta.contenido_raw,
        contenido_generado: {
            titulo_gancho: contenidoIA.titulo_gancho,
            copy_instagram: contenidoIA.copy_instagram,
            textos_capas_graficas: slides,
        },
        assets_links: imageUrls,
        created_at: ahora,
        updated_at: ahora,
    };
    const postRef = await db.collection("planificador_contenido").add(post);
    functions.logger.info(`[espontaneo] Post guardado: /planificador_contenido/${postRef.id}`);
    // ─── Paso 4.5: Registrar en Google Sheets ────────────────
    await (0, googleSheets_1.agregarFilaPost)(postRef.id, ingesta.id_marca, contenidoIA.titulo_gancho, contenidoIA.copy_instagram, contenidoIA.hashtags || "", imageUrls, "PENDIENTE");
    // ─── Paso 5: Enviar resultado a Telegram ─────────────────
    if (chatId) {
        await enviarCarruselTelegram(chatId, contenidoIA, imageUrls, postRef.id);
    }
    functions.logger.info(`[espontaneo] ✅ Proceso completo para ingesta ${ingestaId}`);
});
// ═══════════════════════════════════════════════════════════════
// HELPERS — Generación de contenido
// ═══════════════════════════════════════════════════════════════
function construirPrompt(marca, ingesta) {
    return `Sos el estratega de contenido de ${marca.nombre_comercial}, una empresa de ${marca.datos_negocio.rubro}.

IDENTIDAD DE MARCA:
- Público objetivo: ${marca.datos_negocio.publico_objetivo}
- Propuesta de valor: ${marca.datos_negocio.propuesta_valor}
- Tono de voz: ${marca.comunicacion.tono_de_voz}
- Pilares de contenido: ${marca.comunicacion.pilares_contenido.join(", ")}

INPUT DEL CLIENTE (tipo: ${ingesta.tipo}):
"${ingesta.contenido_raw}"

TAREA: Generá el contenido de un carrusel de Instagram de 3 slides basado en ese input.

REGLAS CRÍTICAS para textos_capas_graficas:
- Exactamente 3 textos, uno por slide
- Cada texto: MÁXIMO 5 palabras. Conciso, directo, impactante.
- NO uses el nombre del rubro como texto de slide
- NO uses palabras genéricas como "regalá", "compartí", "seguinos"
- Usá el tono y las analogías de la marca (ingeniería, estructura, sistemas)
- El slide 3 SIEMPRE termina con: "Orden y firmeza."

Respondé SOLO con este JSON (sin markdown, sin explicaciones):
{
  "titulo_gancho": "Frase gancho de máx 7 palabras, estilo ${marca.nombre_comercial}",
  "copy_instagram": "Caption profesional, 3-4 párrafos cortos con emojis estratégicos, CTA directo al final. Tono: ${marca.comunicacion.tono_de_voz}",
  "hashtags": "#hashtag1 #hashtag2 ... (mínimo 15 hashtags del sector)",
  "textos_capas_graficas": [
    "Máx 5 palabras. Gancho.",
    "Máx 5 palabras. Beneficio clave.",
    "Orden y firmeza."
  ],
  "fecha_hora_sugerida_iso": "${new Date().toISOString()}",
  "formato_recomendado": "CARRUSEL"
}`;
}
function generarPromptFondo(_textoSlide, _rubro) {
    // Prompt genérico de estudio/tecnología — sin incluir texto del slide
    // para evitar que Imagen 4 lo renderice en la imagen
    return ("Dark cinematic professional background photograph. " +
        "Modern corporate office at night, architectural precision, dark navy and steel blue tones, " +
        "dramatic lighting, clean minimalist workspace, glass and concrete textures, " +
        "strategic business environment. " +
        "IMPORTANT: absolutely zero text, zero words, zero letters, zero numbers, " +
        "zero typography anywhere in the image. No human faces. No food. " +
        "Pure background only. Photorealistic, editorial quality, 1:1 square format.");
}
async function generarFondoImagen4(ai, prompt) {
    try {
        const response = await ai.models.generateImages({
            model: "imagen-4.0-fast-generate-001",
            prompt,
            config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio: "1:1" },
        });
        const bytes = response.generatedImages?.[0]?.image?.imageBytes;
        if (!bytes)
            throw new Error("Imagen vacía");
        return Buffer.from(bytes, "base64");
    }
    catch (err) {
        functions.logger.warn("[espontaneo] Imagen 4 falló, usando fallback de color:", err);
        // Fallback: fondo de color sólido
        return (0, sharp_1.default)({
            create: { width: 1080, height: 1080, channels: 3, background: { r: 40, g: 40, b: 50 } },
        }).jpeg().toBuffer();
    }
}
function escaparXML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
function dividirTexto(texto, maxChars) {
    const palabras = texto.split(" ");
    const lineas = [];
    let actual = "";
    for (const p of palabras) {
        if ((actual + " " + p).trim().length <= maxChars) {
            actual = (actual + " " + p).trim();
        }
        else {
            if (actual)
                lineas.push(actual);
            actual = p;
        }
    }
    if (actual)
        lineas.push(actual);
    return lineas;
}
async function componerSlide(fondoBuffer, texto, nSlide, totalSlides, colorPrimario, nombreMarca, logoUrl) {
    const fondo = await (0, sharp_1.default)(fondoBuffer).resize(1080, 1080, { fit: "cover" }).toBuffer();
    const lineas = dividirTexto(texto, 16);
    const y0 = 490, lh = 95;
    const lineaCount = lineas.length;
    // Backing rect detrás del texto (más confiable que feDropShadow en libvips)
    const backingY = y0 - 65;
    const backingH = lineaCount * lh + 50;
    const textoSVG = lineas.map((l, i) => `<text x="540" y="${y0 + i * lh}"
      font-family="Georgia, serif" font-size="76" font-weight="bold"
      fill="#FFFFFF" text-anchor="middle">${escaparXML(l)}</text>`).join("\n");
    // Dots de navegación — encima del logo
    const puntos = Array.from({ length: totalSlides }, (_, i) => {
        const cx = 540 - ((totalSlides - 1) * 26) / 2 + i * 26;
        return `<circle cx="${cx}" cy="960" r="${i === nSlide - 1 ? 9 : 5}"
      fill="#FFF" fill-opacity="${i === nSlide - 1 ? 1 : 0.5}" />`;
    }).join("\n");
    // Si no hay logo real, el nombre de marca como texto fallback (centrado)
    const tieneLogoReal = logoUrl && !logoUrl.includes("placeholder") && !logoUrl.includes("LOGO");
    const marcaFallback = tieneLogoReal
        ? ""
        : `<text x="540" y="1032" font-family="Arial, sans-serif" font-size="26" font-weight="700"
        fill="#FFF" fill-opacity="0.90" letter-spacing="3" text-anchor="middle"
        >${escaparXML(nombreMarca.toUpperCase())}</text>`;
    const overlay = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="35%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <!-- Gradiente base -->
  <rect width="1080" height="1080" fill="url(#grad)"/>
  <!-- Barra de color primario arriba -->
  <rect x="0" y="0" width="1080" height="10" fill="${colorPrimario}"/>
  <!-- Contador de slides -->
  <rect x="922" y="44" width="116" height="46" rx="23" fill="#000" fill-opacity="0.55"/>
  <text x="980" y="76" font-family="Arial, sans-serif" font-size="22" font-weight="600"
    fill="#FFF" text-anchor="middle">${nSlide}/${totalSlides}</text>
  <!-- Backing rect semitransparente detrás del texto -->
  <rect x="60" y="${backingY}" width="960" height="${backingH}" rx="10"
    fill="#000000" fill-opacity="0.52"/>
  <!-- Texto principal -->
  ${textoSVG}
  <!-- Marca fallback (solo si no hay logo) -->
  ${marcaFallback}
  <!-- Dots de navegación -->
  ${puntos}
</svg>`;
    // Base: fondo + overlay SVG
    let base = await (0, sharp_1.default)(fondo)
        .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
        .toBuffer();
    // ─── Logo centrado abajo ─────────────────────────────────────
    if (tieneLogoReal) {
        try {
            const logoRes = await axios_1.default.get(logoUrl, {
                responseType: "arraybuffer",
                timeout: 10000,
            });
            const logoRaw = Buffer.from(logoRes.data);
            // Redimensionar: máx 280px ancho, máx 100px alto
            const logoResized = await (0, sharp_1.default)(logoRaw)
                .resize(280, 100, { fit: "inside", withoutEnlargement: true })
                .png()
                .toBuffer();
            const meta = await (0, sharp_1.default)(logoResized).metadata();
            const logoW = meta.width ?? 280;
            const logoH = meta.height ?? 100;
            // Posición: centrado horizontal, y=990 (abajo, encima del borde)
            const logoLeft = Math.round((1080 - logoW) / 2);
            const logoTop = 990 - logoH;
            // Píldora semitransparente detrás del logo
            const padX = 32, padY = 16;
            const pillW = logoW + padX * 2;
            const pillH = logoH + padY * 2;
            const pillLeft = Math.round((1080 - pillW) / 2);
            const pillTop = logoTop - padY;
            const rx = Math.round(pillH / 2);
            const pill = Buffer.from(`<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${pillW}" height="${pillH}" rx="${rx}" fill="#000000" fill-opacity="0.38"/>
        </svg>`);
            base = await (0, sharp_1.default)(base)
                .composite([
                { input: pill, top: pillTop, left: pillLeft },
                { input: logoResized, top: logoTop, left: logoLeft },
            ])
                .toBuffer();
            functions.logger.info(`[espontaneo] Logo superpuesto: ${logoW}x${logoH}px`);
        }
        catch (err) {
            functions.logger.warn("[espontaneo] No se pudo superponer el logo:", err);
            // Continua sin logo — el nombre en texto ya está en el overlay
        }
    }
    return (0, sharp_1.default)(base).png({ quality: 92 }).toBuffer();
}
// ═══════════════════════════════════════════════════════════════
// HELPERS — Firebase Storage con reintentos
// ═══════════════════════════════════════════════════════════════
async function subirConReintentos(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
bucket, fileName, buffer, intentos = 3) {
    for (let i = 1; i <= intentos; i++) {
        try {
            const file = bucket.file(fileName);
            await file.save(buffer, {
                contentType: "image/png",
                resumable: false, // upload directo, más robusto para archivos < 5MB
            });
            await file.makePublic();
            return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        }
        catch (err) {
            functions.logger.warn(`[storage] Intento ${i}/${intentos} falló para ${fileName}:`, err?.message ?? err);
            if (i === intentos)
                throw err;
            // Backoff: 2s, 4s
            await new Promise((r) => setTimeout(r, i * 2000));
        }
    }
    throw new Error("subirConReintentos: no debería llegar aquí");
}
// ═══════════════════════════════════════════════════════════════
// HELPERS — Telegram
// ═══════════════════════════════════════════════════════════════
async function enviarCarruselTelegram(chatId, contenido, imageUrls, postId) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken)
        return;
    const base = `https://api.telegram.org/bot${botToken}`;
    try {
        // 1. Enviar el álbum de imágenes (hasta 10)
        const media = imageUrls.slice(0, 10).map((url, i) => ({
            type: "photo",
            media: url,
            caption: i === 0 ? `🎨 *${contenido.titulo_gancho}*` : undefined,
            parse_mode: i === 0 ? "Markdown" : undefined,
        }));
        await axios_1.default.post(`${base}/sendMediaGroup`, { chat_id: chatId, media });
        // 2. Enviar el copy como mensaje separado
        const mensajeCopy = `📝 *Copy para Instagram:*\n\n${contenido.copy_instagram}\n\n` +
            `🏷️ *Hashtags:*\n${contenido.hashtags}\n\n` +
            `✅ *Estado:* PENDIENTE de aprobación\n` +
            `🆔 *ID Post:* \`${postId}\``;
        await axios_1.default.post(`${base}/sendMessage`, {
            chat_id: chatId,
            text: mensajeCopy,
            parse_mode: "Markdown",
        });
        functions.logger.info(`[espontaneo] Carrusel enviado a Telegram chat_id: ${chatId}`);
    }
    catch (err) {
        functions.logger.error("[espontaneo] Error enviando carrusel a Telegram:", err);
    }
}
//# sourceMappingURL=generarContenidoEspontaneo.js.map