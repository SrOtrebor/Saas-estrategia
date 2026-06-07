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
const googleSheets_1 = require("../lib/googleSheets");
// ═══════════════════════════════════════════════════════════════
// CLOUD FUNCTION: generarContenidoEspontaneo
// Trigger: onCreate en /cola_ingesta/{id}
// ═══════════════════════════════════════════════════════════════
exports.generarContenidoEspontaneo = functions
    .runWith({ timeoutSeconds: 300, memory: "2GB" })
    .firestore.document("cola_ingesta/{ingestaId}")
    .onCreate(async (snap, context) => {
    const ingestaId = context.params.ingestaId;
    const ingesta = snap.data();
    functions.logger.info(`[espontaneo] Procesando ingesta ${ingestaId} para marca ${ingesta.id_marca}`);
    const db = admin.firestore();
    // ─── Paso 1: Obtener config de la marca y memoria de chat ──
    const marcaDoc = await db.collection("marcas").doc(ingesta.id_marca).get();
    if (!marcaDoc.exists)
        return;
    const marca = marcaDoc.data();
    const chatId = marca.credenciales_redes?.telegram_chat_id;
    if (!chatId)
        return;
    const sesionesRef = db.collection("sesiones_bot").doc(chatId);
    const sesionSnap = await sesionesRef.get();
    let historia = sesionSnap.exists ? sesionSnap.data()?.historia || [] : [];
    // ─── Paso 2: Generar respuesta con Gemini 2.5 Flash ────────
    functions.logger.info("[espontaneo] Consultando a Gemini con Google Grounding...");
    const ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // Agregar mensaje actual al historial temporalmente para el prompt
    const prompt = construirPromptBot(marca, ingesta.contenido_raw, historia);
    const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            // No se puede usar responseMimeType: "application/json" junto con googleSearch
            tools: [{ googleSearch: {} }]
        },
    });
    let IA;
    try {
        let rawText = geminiResponse.text ?? "{}";
        // Intentar extraer JSON si Gemini agregó texto extra
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            rawText = jsonMatch[0];
        }
        IA = JSON.parse(rawText);
    }
    catch (err) {
        functions.logger.error("Error parseando JSON de Gemini. Raw text:", geminiResponse.text);
        // Fallback a IDEACION si el usuario dio texto plano
        if (geminiResponse.text && geminiResponse.text.includes("EJECUCION")) {
            throw new Error("Respuesta de Gemini no es JSON válido para Ejecución");
        }
        IA = {
            intencion: "IDEACION",
            respuesta_texto: geminiResponse.text || "Hubo un error interpretando tu solicitud."
        };
    }
    // Actualizar historial
    historia.push({ rol: "usuario", texto: ingesta.contenido_raw });
    historia.push({ rol: "asistente", texto: IA.respuesta_texto || "Ejecutando carrusel..." });
    if (historia.length > 8)
        historia = historia.slice(-8); // Guardar últimos 8 mensajes
    await sesionesRef.set({ historia });
    // ─── Paso 3: Enrutar según Intención ───────────────────────
    if (IA.intencion === "IDEACION") {
        functions.logger.info(`[espontaneo] Intención: IDEACION. Enviando mensaje.`);
        const replyMarkup = {
            inline_keyboard: [
                [{ text: "💡 Desarrollar Idea 1 en Docs", callback_data: "docs_idea_1" }],
                [{ text: "💡 Desarrollar Idea 2 en Docs", callback_data: "docs_idea_2" }],
                [{ text: "📚 Desarrollar TODAS en Docs", callback_data: "docs_todas" }]
            ]
        };
        await enviarMensaje(chatId, IA.respuesta_texto || "Aquí tienes algunas ideas...", replyMarkup);
        await snap.ref.delete(); // Limpiar cola
        return;
    }
    // ─── MODO EJECUCIÓN (Generar Carrusel) ─────────────────────
    functions.logger.info(`[espontaneo] Intención: EJECUCION. Generando carrusel...`);
    const contenidoIA = IA.carrusel_json;
    if (!contenidoIA)
        throw new Error("No hay carrusel_json en la respuesta de ejecución.");
    // Avisar por Telegram que empezó la renderización
    await enviarMensaje(chatId, "🎨 *Idea seleccionada.* Renderizando imágenes e inyectando textos... Esto puede demorar unos segundos.");
    const slides = contenidoIA.textos_capas_graficas ?? [contenidoIA.titulo_gancho];
    const totalSlides = Math.min(slides.length, 7);
    const imageUrls = [];
    // 1. Generar la plantilla HTML dinámica con Gemini
    const plantillaHtml = await generarPlantillaHTML(ai, marca);
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
            // Reemplazar marcadores en la plantilla (no cambiamos \n a <br> si ya es HTML, 
            // pero lo dejamos para compatibilidad con textos legacy o que no tengan block tags)
            let textoHtml = slides[i];
            if (!textoHtml.includes("<h") && !textoHtml.includes("<p")) {
                textoHtml = textoHtml.replace(/\n/g, "<br>");
            }
            const htmlPlaca = plantillaHtml
                .replace(/\{\{TEXTO\}\}/g, textoHtml)
                .replace(/\{\{SLIDE_ACTUAL\}\}/g, String(i + 1))
                .replace(/\{\{SLIDE_TOTAL\}\}/g, String(totalSlides))
                .replace(/\{\{LOGO_URL\}\}/g, marca.identidad_visual.logo_url || "");
            const page = await browser.newPage();
            await page.setViewport({ width: 1080, height: 1080 });
            await page.setContent(htmlPlaca, { waitUntil: "networkidle0" });
            const buffer = await page.screenshot({ type: "jpeg", quality: 90 });
            await page.close();
            const bucket = admin.storage().bucket();
            const fileName = `posts/${ingesta.id_marca}/${ingestaId}/slide_${i + 1}.jpg`;
            const publicUrl = await subirConReintentos(bucket, fileName, buffer);
            imageUrls.push(publicUrl);
        }
    }
    finally {
        await browser.close();
    }
    // Guardar en planificador_contenido
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
    // Google Sheets
    await (0, googleSheets_1.agregarFilaPost)(postRef.id, ingesta.id_marca, contenidoIA.titulo_gancho, contenidoIA.copy_instagram, contenidoIA.hashtags || "", imageUrls, "PENDIENTE");
    // Enviar carrusel a Telegram
    await enviarCarruselTelegram(chatId, contenidoIA, imageUrls, postRef.id);
    await snap.ref.delete(); // Limpiar cola
    functions.logger.info(`[espontaneo] ✅ Proceso de ejecución completo.`);
});
// ═══════════════════════════════════════════════════════════════
// HELPERS — Generación de contenido
// ═══════════════════════════════════════════════════════════════
function construirPromptBot(marca, inputUsuario, historia) {
    const historialValido = historia.filter(h => !h.texto.includes('{{') && !h.texto.includes(']]'));
    const historialTexto = historialValido.length > 0
        ? "\nHISTORIAL RECIENTE DE LA CONVERSACIÓN:\n" + historialValido.map(h => `${h.rol.toUpperCase()}: ${h.texto}`).join("\n")
        : "\n[No hay historial reciente]";
    return `Sos un COPYWRITER SENIOR y ESTRATEGA DE MARKETING para la marca ${marca.nombre_comercial} (Rubro: ${marca.datos_negocio.rubro}).
Tu objetivo es ayudar al usuario a investigar tendencias, idear guiones y ejecutar carruseles gráficos.

IDENTIDAD DE MARCA:
- Público: ${marca.datos_negocio.publico_objetivo}
- Tono: ${marca.comunicacion.tono_de_voz}
- Pilares: ${marca.comunicacion.pilares_contenido.join(", ")}

Tenés DOS MODOS de operación (elegí el correcto según el input):

MODO 1: IDEACIÓN (Búsqueda y Propuestas)
Si el usuario te pide tendencias, ideas, de qué hablar, o simplemente te cuenta una idea por arriba:
- USÁ GOOGLE SEARCH para investigar las tendencias actuales de hoy sobre el tema o rubro.
- Devolvé intencion: "IDEACION".
- En respuesta_texto, escribile en Markdown:
  1) Breve resumen de las 2 tendencias actuales reales.
  2) 2 Ideas conceptuales MUY RESUMIDAS (solo la premisa principal, un párrafo por idea) para guiones o carruseles.
IMPORTANTE: Debes ser extremadamente breve en IDEACION para evitar límites de texto en Telegram. NO escribas el guion completo todavía.

MODO 2: EJECUCIÓN (Generar Carrusel Final)
Si el usuario te dice explícitamente "Armá el carrusel de la idea 2", "Hacé el carrusel sobre X", o te da un texto directo para diseñar:
- Devolvé intencion: "EJECUCION".
- En carrusel_json, escribí el contenido final como Copywriter de élite usando frameworks como AIDA o PAS. NO repitas el input crudo. Expandilo con creatividad.

${historialTexto}

INPUT DEL USUARIO AHORA:
"${inputUsuario}"

REGLA CRÍTICA Y OBLIGATORIA: Tu respuesta DEBE ser ÚNICA y EXCLUSIVAMENTE un objeto JSON válido. NO escribas NADA fuera de las llaves { }. NO uses markdown de código.
IMPORTANTE: NO uses comillas dobles ("") dentro de los textos, usa comillas simples ('') o escápalas correctamente (\") para evitar romper el JSON.
PROHIBICIÓN ESTRICTA: NUNCA, BAJO NINGUNA CIRCUNSTANCIA, uses placeholders (como {{TITULO}}, [TEXTO AQUÍ] o similares). DEBES redactar el contenido final, persuasivo y definitivo, listo para publicarse. Si la idea es corta, tú debes expandirla e inventar el copy completo.
Estructura esperada:
{
  "intencion": "IDEACION" o "EJECUCION",
  "respuesta_texto": "Texto en markdown con las ideas y guiones (solo si es IDEACION)",
  "carrusel_json": {
    "titulo_gancho": "Gancho controversial o de alta curiosidad (máx 7 palabras)",
    "copy_instagram": "Caption largo, persuasivo, con emojis y CTA claro. Mínimo 3 párrafos.",
    "hashtags": "#hashtag1 #hashtag2 ... (mínimo 15 estratégicos)",
    "textos_capas_graficas": [
      "<h2>ETAPA 1 - EL PROBLEMA</h2><h1>TÍTULO DE IMPACTO GIGANTE</h1><p>Párrafo profundo que explique el dolor del cliente y cómo lo vive en el día a día.</p><div class='highlight'>Remate: Por qué esto es una trampa.</div>",
      "<h2>DESARROLLO</h2><h1>SÍNTOMAS DEL CAOS</h1><p>Cómo operás hoy:</p><ul><li>Síntoma 1 con mucho detalle.</li><li>Síntoma 2 con intención.</li></ul><div class='highlight'>Acá es donde el 90% se estanca.</div>",
      "<h2>LA SOLUCIÓN</h2><h1>NUESTRA INGENIERÍA</h1><p>Explicación de cómo tu marca lo resuelve.</p><div class='highlight'>Llamado a la acción fuerte.</div>"
    ],
    "fecha_hora_sugerida_iso": "${new Date().toISOString()}",
    "formato_recomendado": "CARRUSEL"
  }
}

INSTRUCCIONES PARA CAPAS GRÁFICAS (textos_capas_graficas):
No escribas poco, pero tampoco satures la imagen. Queremos placas con INTENCIÓN, estilo consultoría premium. Usa SÓLO etiquetas HTML para la estructura:
- <h2> para la 'píldora' superior (categoría o etapa).
- <h1> para el gancho (muy impactante y controversial).
- <p> para párrafos descriptivos profundos (máximo 2 a 3 oraciones por placa, aprox 30-40 palabras para mantener diseño limpio).
- <ul> y <li> para viñetas (máximo 3 puntos).
- <div class='highlight'> para recuadros de remate abajo.`;
}
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
async function generarPlantillaHTML(ai, marca) {
    const rawColor = marca.identidad_visual.color_primario_hex || "#d4af37";
    const color = rawColor.startsWith('#') ? rawColor : '#' + rawColor;
    const isDark = getLuminance(color) < 0.5;
    const textColorOnColor = isDark ? "#ffffff" : "#111111";
    const brightColor = getBrightColor(color);
    const logo = "{{LOGO_URL}}";
    const texto = "{{TEXTO}}";
    const fontImport = `<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800;900&display=swap" rel="stylesheet">`;
    const plantillas = [
        // VARIANTE 1: CLARO / BLANCO (Fondo blanco, borde grueso)
        `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #ffffff; color: #222222; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 50px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-left: 20px solid ${color}; background-color: #f8f9fa; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; }
      .logo { max-height: 50px; filter: grayscale(1) contrast(2); opacity: 0.8; }
      h2 { color: ${color}; padding: 0; font-size: 22px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; letter-spacing: 1px; border-bottom: 4px solid ${color}; }
      h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #111111; }
      p { font-size: 28px; line-height: 1.4; color: #444444; margin: 0 0 20px 0; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 28px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 600; color: #333333; }
      li::before { content: '■'; position: absolute; left: 0; color: ${color}; }
      .highlight { background: rgba(0,0,0,0.05); border-left: 6px solid ${color}; padding: 20px 30px; font-size: 26px; font-weight: 800; color: #111111; margin-top: auto; width: 100%; box-sizing: border-box; }
    </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,
        // VARIANTE 2: OSCURO PREMIUM (Usa brightColor para que resalte)
        `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #0b0f19; color: #f5f5f5; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 50px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.4); box-shadow: 15px 15px 0px ${brightColor}30; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-end; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: brightness(0) invert(1); opacity: 0.6; }
      h2 { color: ${brightColor}; font-size: 20px; font-weight: 700; border-left: 4px solid ${brightColor}; padding-left: 15px; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
      h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #ffffff; }
      p { font-size: 28px; line-height: 1.4; color: #d0d0d0; margin: 0 0 20px 0; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 28px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 500; color: #e0e0e0; }
      li::before { content: '━'; position: absolute; left: 0; color: ${brightColor}; }
      .highlight { background: rgba(255,255,255,0.03); border: 1px solid ${brightColor}50; padding: 20px 30px; font-size: 26px; font-weight: 700; color: #fff; margin-top: auto; width: 100%; box-sizing: border-box; }
    </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,
        // VARIANTE 3: COLOR SÓLIDO (Fondo 100% color de la marca)
        `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: ${color}; color: ${textColorOnColor}; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 70px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; background: transparent; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: space-between; margin-top: 15px; flex-shrink: 0; width: 100%; border-top: 2px solid ${textColorOnColor}40; padding-top: 20px;}
      .logo { max-height: 50px; ${isDark ? 'filter: brightness(0) invert(1);' : 'filter: brightness(0);'} opacity: 0.9; }
      h2 { background-color: ${textColorOnColor}; color: ${color}; padding: 8px 20px; border-radius: 5px; font-size: 22px; font-weight: 900; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; letter-spacing: 2px; }
      h1 { font-size: 55px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: ${textColorOnColor}; }
      p { font-size: 30px; line-height: 1.4; color: ${textColorOnColor}; opacity: 0.9; margin: 0 0 20px 0; font-weight: 500;}
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 700; color: ${textColorOnColor}; }
      li::before { content: '→'; position: absolute; left: 0; color: ${textColorOnColor}; font-weight: bold;}
      .highlight { background: ${textColorOnColor}15; border-radius: 10px; padding: 25px 30px; font-size: 28px; font-weight: 800; color: ${textColorOnColor}; margin-top: auto; width: 100%; box-sizing: border-box; text-align: left; border: 2px solid ${textColorOnColor}40; }
    </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,
        // VARIANTE 4: MITAD Y MITAD (Split screen)
        `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background: linear-gradient(180deg, #ffffff 40%, ${color} 40%); color: #333; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 30px; background: #ffffff; box-shadow: 0 30px 60px rgba(0,0,0,0.3); }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: grayscale(1) contrast(2); opacity: 0.8; }
      h2 { color: #ffffff; background: ${color}; padding: 8px 25px; border-radius: 50px; font-size: 20px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
      h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #000000; }
      p { font-size: 28px; line-height: 1.4; color: #555555; margin: 0 0 20px 0; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 28px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 600; color: #333333; }
      li::before { content: '◆'; position: absolute; left: 0; color: ${color}; font-size: 22px; }
      .highlight { background: rgba(0,0,0,0.03); border: 2px dashed ${color}80; padding: 20px 30px; font-size: 26px; font-weight: 800; color: #000000; margin-top: auto; width: 100%; box-sizing: border-box; text-align: center; border-radius: 15px;}
    </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,
        // VARIANTE 5: SOFT CREAM / EDITORIAL
        `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #F4F0EB; color: #333333; font-family: 'Georgia', serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border: 1px solid #dcd3c6; background: transparent; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: center; align-items: center; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: grayscale(1); opacity: 0.7; }
      h2 { color: ${color}; font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 700; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; letter-spacing: 3px; border-bottom: 1px solid ${color}; padding-bottom: 5px;}
      h1 { font-size: 55px; font-weight: normal; line-height: 1.1; margin: 0 0 20px 0; color: #111111; font-style: italic; }
      p { font-size: 28px; line-height: 1.5; color: #555555; margin: 0 0 20px 0; font-family: 'Montserrat', sans-serif;}
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; text-align: left; display: inline-block; font-family: 'Montserrat', sans-serif;}
      li { font-size: 26px; line-height: 1.5; margin-bottom: 15px; padding-left: 30px; position: relative; font-weight: 500; color: #333333; }
      li::before { content: '—'; position: absolute; left: 0; color: ${color}; font-weight: bold;}
      .highlight { background: #EAE3D9; padding: 25px 40px; font-size: 24px; font-weight: normal; font-style: italic; color: #111111; margin-top: auto; width: 100%; box-sizing: border-box; border-radius: 5px; }
    </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,
        // VARIANTE 6: DARK BRUTALIST (Gigante cuadrado de color detrás)
        `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #000000; color: #f5f5f5; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 50px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border: 4px solid #ffffff; background-color: #000000; transform: translate(-20px, -20px); box-shadow: 25px 25px 0px ${color}; }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: brightness(0) invert(1); opacity: 0.9; }
      h2 { background-color: #ffffff; color: #000000; padding: 5px 15px; font-size: 22px; font-weight: 900; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; }
      h1 { font-size: 55px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #ffffff; }
      p { font-size: 30px; line-height: 1.4; color: #dddddd; margin: 0 0 20px 0; font-weight: 500; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 600; color: #ffffff; }
      li::before { content: '►'; position: absolute; left: 0; color: ${color}; }
      .highlight { background: ${color}; color: ${textColorOnColor}; padding: 20px 30px; font-size: 28px; font-weight: 900; margin-top: auto; width: 100%; box-sizing: border-box; text-transform: uppercase; }
    </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,
        // VARIANTE 7: LIGHT MINIMALIST CENTRADO
        `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 40px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #f0f2f5; color: #1c1e21; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 60px; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 40px; background: #ffffff; box-shadow: 0 20px 50px rgba(0,0,0,0.08); }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: center; align-items: center; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-top: 15px; flex-shrink: 0; }
      .logo { max-height: 50px; filter: grayscale(1) contrast(2); opacity: 0.6; }
      h2 { color: ${color}; padding: 8px 25px; border-radius: 50px; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; margin-top: 0; display: inline-block; background-color: ${color}15; letter-spacing: 1px;}
      h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; text-transform: uppercase; color: #000000; text-align: center; }
      p { font-size: 30px; line-height: 1.4; color: #555555; margin: 0 0 20px 0; text-align: center; }
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; text-align: left; display: inline-block; }
      li { font-size: 28px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 600; color: #333333; }
      li::before { content: '✓'; position: absolute; left: 0; color: ${color}; font-weight: bold; font-size: 32px; line-height: 32px;}
      .highlight { background: transparent; border-top: 2px solid #eeeeee; border-bottom: 2px solid #eeeeee; padding: 25px 30px; font-size: 26px; font-weight: 700; color: #111111; margin-top: auto; text-align: center; width: 100%; box-sizing: border-box; }
    </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`,
        // VARIANTE 8: OSCURO CON FONDO DE IMAGEN TRAMA Y ACENTO ENORME
        `<!DOCTYPE html><html><head><meta charset="UTF-8">${fontImport}<style>
      body { width: 1080px; height: 1080px; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: flex-end; justify-content: center; background-color: #080a0f; background-image: radial-gradient(${brightColor}20 1px, transparent 1px); background-size: 40px 40px; color: #f5f5f5; font-family: 'Montserrat', sans-serif; word-break: break-word; overflow-wrap: anywhere; }
      .card { padding: 50px 60px 70px 60px; width: 100%; height: 85%; box-sizing: border-box; display: flex; flex-direction: column; position: relative; border-radius: 40px 40px 0 0; background: linear-gradient(180deg, #111520 0%, #080a0f 100%); border-top: 2px solid ${brightColor}50; border-left: 2px solid ${brightColor}50; border-right: 2px solid ${brightColor}50; box-shadow: 0 -20px 60px rgba(0,0,0,0.8); }
      .content-wrapper { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; text-align: left; align-items: flex-start; }
      .footer { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; margin-top: 15px; flex-shrink: 0; width: 100%; }
      .logo { max-height: 50px; filter: brightness(0) invert(1); opacity: 0.8; }
      h2 { color: #000000; background: ${brightColor}; padding: 8px 20px; border-radius: 5px; font-size: 20px; font-weight: 900; text-transform: uppercase; margin-bottom: 30px; margin-top: 0; display: inline-block; }
      h1 { font-size: 50px; font-weight: 900; line-height: 1.1; margin: 0 0 25px 0; text-transform: uppercase; color: #ffffff; }
      p { font-size: 30px; line-height: 1.4; color: #cccccc; margin: 0 0 20px 0; font-weight: 500;}
      ul { list-style: none; padding: 0; margin: 0 0 20px 0; }
      li { font-size: 30px; line-height: 1.4; margin-bottom: 15px; padding-left: 40px; position: relative; font-weight: 500; color: #eeeeee; }
      li::before { content: '➤'; position: absolute; left: 0; color: ${brightColor}; }
      .highlight { background: rgba(0,0,0,0.3); padding: 25px 30px; font-size: 26px; font-weight: 700; color: #ffffff; margin-top: auto; width: 100%; box-sizing: border-box; border-left: 8px solid ${brightColor}; }
    </style></head><body><div class="card"><div class="content-wrapper">${texto}</div><div class="footer"><img src="${logo}" class="logo"></div></div></body></html>`
    ];
    // Elegir una al azar
    return plantillas[Math.floor(Math.random() * plantillas.length)];
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
const enviarMensaje = async (chatId, text, replyMarkup) => {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const MAX_LENGTH = 3500;
    // SANITIZACIÓN: Telegram usa Markdown (legacy) que se rompe si usamos asteriscos para listas
    // Reemplazamos los asteriscos de inicio de lista por guiones:
    let safeText = text.replace(/(^|\n)\s*\*\s/g, "$1- ");
    // Reemplazamos asteriscos impares sueltos (muy complejo con regex perfecto, pero intentamos 
    // asegurar que las negritas estén bien formateadas).
    // Dividir el mensaje por párrafos para no romper el Markdown
    const paragraphs = safeText.split("\n\n");
    let currentChunk = "";
    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        if ((currentChunk.length + p.length) > MAX_LENGTH) {
            if (currentChunk.trim().length > 0) {
                try {
                    await axios_1.default.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        chat_id: chatId,
                        text: currentChunk.trim(),
                        parse_mode: "Markdown",
                    });
                }
                catch (err) {
                    functions.logger.warn("[espontaneo] Error enviando chunk:", err);
                }
            }
            currentChunk = p + "\n\n";
        }
        else {
            currentChunk += p + "\n\n";
        }
    }
    if (currentChunk.trim().length > 0) {
        try {
            await axios_1.default.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: currentChunk.trim(),
                parse_mode: "Markdown",
                ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
            });
        }
        catch (err) {
            functions.logger.warn("[espontaneo] Error enviando chunk final:", err);
        }
    }
};
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