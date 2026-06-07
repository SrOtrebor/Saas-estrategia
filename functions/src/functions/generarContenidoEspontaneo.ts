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

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { MarcaConfig, ContenidoGeneradoIA, IngestaPayload, PosteoContenido } from "../interfaces";
import { agregarFilaPost } from "../lib/googleSheets";

// ═══════════════════════════════════════════════════════════════
// CLOUD FUNCTION: generarContenidoEspontaneo
// Trigger: onCreate en /cola_ingesta/{id}
// ═══════════════════════════════════════════════════════════════

export const generarContenidoEspontaneo = functions
  .runWith({ timeoutSeconds: 300, memory: "2GB" })
  .firestore.document("cola_ingesta/{ingestaId}")
  .onCreate(async (snap, context) => {
    const ingestaId = context.params.ingestaId;
    const ingesta = snap.data() as IngestaPayload;

    functions.logger.info(`[espontaneo] Procesando ingesta ${ingestaId} para marca ${ingesta.id_marca}`);

    const db = admin.firestore();

    // ─── Paso 1: Obtener config de la marca y memoria de chat ──
    const marcaDoc = await db.collection("marcas").doc(ingesta.id_marca).get();
    if (!marcaDoc.exists) return;
    const marca = marcaDoc.data() as MarcaConfig;
    const chatId = marca.credenciales_redes?.telegram_chat_id;
    if (!chatId) return;

    const sesionesRef = db.collection("sesiones_bot").doc(chatId);
    const sesionSnap = await sesionesRef.get();
    let historia = sesionSnap.exists ? sesionSnap.data()?.historia || [] : [];

    // ─── Paso 2: Generar respuesta con Gemini 2.5 Flash ────────
    functions.logger.info("[espontaneo] Consultando a Gemini con Google Grounding...");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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

    let IA: { intencion: string; respuesta_texto?: string; carrusel_json?: ContenidoGeneradoIA };
    try {
      let rawText = geminiResponse.text ?? "{}";
      // Intentar extraer JSON si Gemini agregó texto extra
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        rawText = jsonMatch[0];
      }
      IA = JSON.parse(rawText);
    } catch (err) {
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
    if (historia.length > 8) historia = historia.slice(-8); // Guardar últimos 8 mensajes
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
    if (!contenidoIA) throw new Error("No hay carrusel_json en la respuesta de ejecución.");

    // Avisar por Telegram que empezó la renderización
    await enviarMensaje(chatId, "🎨 *Idea seleccionada.* Renderizando imágenes e inyectando textos... Esto puede demorar unos segundos.");

    const slides = contenidoIA.textos_capas_graficas ?? [contenidoIA.titulo_gancho];
    const totalSlides = Math.min(slides.length, 7);
    const imageUrls: string[] = [];

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
        // Reemplazar marcadores en la plantilla
        let textoHtml = slides[i].replace(/\n/g, "<br>");
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
        const publicUrl = await subirConReintentos(bucket, fileName, buffer as Buffer);
        imageUrls.push(publicUrl);
      }
    } finally {
      await browser.close();
    }

    // Guardar en planificador_contenido
    const ahora = Timestamp.now();
    const post: Omit<PosteoContenido, "id_post"> = {
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
    await agregarFilaPost(
      postRef.id,
      ingesta.id_marca,
      contenidoIA.titulo_gancho,
      contenidoIA.copy_instagram,
      contenidoIA.hashtags || "",
      imageUrls,
      "PENDIENTE"
    );

    // Enviar carrusel a Telegram
    await enviarCarruselTelegram(chatId, contenidoIA, imageUrls, postRef.id);
    await snap.ref.delete(); // Limpiar cola
    functions.logger.info(`[espontaneo] ✅ Proceso de ejecución completo.`);
  });

// ═══════════════════════════════════════════════════════════════
// HELPERS — Generación de contenido
// ═══════════════════════════════════════════════════════════════

function construirPromptBot(marca: MarcaConfig, inputUsuario: string, historia: any[]): string {
  const historialTexto = historia.length > 0
    ? "\nHISTORIAL RECIENTE DE LA CONVERSACIÓN:\n" + historia.map(h => `${h.rol.toUpperCase()}: ${h.texto}`).join("\n")
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
Estructura esperada:
{
  "intencion": "IDEACION" o "EJECUCION",
  "respuesta_texto": "Texto en markdown con las ideas y guiones (solo si es IDEACION)",
  "carrusel_json": {
    "titulo_gancho": "Gancho controversial o de alta curiosidad (máx 7 palabras)",
    "copy_instagram": "Caption largo, persuasivo, con emojis y CTA claro. Mínimo 3 párrafos.",
    "hashtags": "#hashtag1 #hashtag2 ... (mínimo 15 estratégicos)",
    "textos_capas_graficas": [
      "Slide 1: Máx 5 palabras. Gancho directo.",
      "Slide 2: Máx 5 palabras. Desarrollo/Beneficio.",
      "Slide 3: Orden y firmeza."
    ],
    "fecha_hora_sugerida_iso": "${new Date().toISOString()}",
    "formato_recomendado": "CARRUSEL"
  }
}`;
}

async function generarPlantillaHTML(ai: GoogleGenAI, marca: MarcaConfig): Promise<string> {
  const prompt = `Actúa como un Diseñador Web y Gráfico Experto de élite.
Tu tarea es inventar una plantilla HTML/CSS para un carrusel de Instagram (1080x1080 píxeles) para la marca "${marca.nombre_comercial}" (Rubro: ${marca.datos_negocio.rubro}).

Identidad Visual:
- Color Primario: ${marca.identidad_visual.color_primario_hex}
- Usa Google Fonts modernas y limpias (ej: Montserrat, Inter, Playfair Display) cargadas via @import.

Requisitos Técnicos Estrictos:
1. El tamaño DEBE ser exactamente 1080x1080. Añade esto en el CSS:
   body { width: 1080px; height: 1080px; margin: 0; padding: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #0d0d0d; color: #fff; font-family: 'Inter', sans-serif; }
2. El diseño debe ser ESPECTACULAR, premium, estético y moderno. Usa gradientes sutiles, sombras suaves (glassmorphism), patrones geométricos hechos con CSS puro o fondos abstractos creados con degradados radiales.
3. El diseño debe incluir los siguientes MARCADORES DE POSICIÓN EXACTOS (yo los reemplazaré en mi código backend por el texto real):
   - {{TEXTO}} : El texto principal de la placa (debe ir muy grande, legible, en el centro o destacado).
   - {{SLIDE_ACTUAL}} / {{SLIDE_TOTAL}} : El contador de placas, usualmente minimalista arriba a la derecha o abajo en el centro.
   - {{LOGO_URL}} : Úsalo en un tag <img src="{{LOGO_URL}}" style="max-height: 80px; object-fit: contain;"> (usualmente centrado abajo).
4. Usa layouts Flexbox o CSS Grid.
5. NO uses imágenes externas (salvo el logo). Todo el arte y diseño debe ser CSS puro.

Devuelve ÚNICAMENTE el código HTML completo (con CSS incrustado). Sin explicaciones, sin bloques de markdown de código (\`\`\`), solo el código crudo que empiece con <!DOCTYPE html>.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
    });

    let html = response.text || "";
    // Limpiar markdown residual si Gemini no hace caso omiso
    html = html.replace(/```html/gi, "").replace(/```/g, "").trim();
    if (!html.startsWith("<!DOCTYPE") && !html.startsWith("<html")) {
      html = "<!DOCTYPE html><html><head><style>body{background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:1080px;width:1080px;margin:0;font-family:sans-serif;}h1{font-size:80px;text-align:center;padding:100px;}</style></head><body><div><h1>{{TEXTO}}</h1></div></body></html>";
    }
    return html;
  } catch (err) {
    functions.logger.error("[espontaneo] Error generando plantilla HTML:", err);
    throw new Error("No se pudo generar la plantilla HTML.");
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS — Firebase Storage con reintentos
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
        contentType: "image/png",
        resumable: false, // upload directo, más robusto para archivos < 5MB
      });
      await file.makePublic();
      return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    } catch (err: any) {
      functions.logger.warn(
        `[storage] Intento ${i}/${intentos} falló para ${fileName}:`,
        err?.message ?? err
      );
      if (i === intentos) throw err;
      // Backoff: 2s, 4s
      await new Promise((r) => setTimeout(r, i * 2000));
    }
  }
  throw new Error("subirConReintentos: no debería llegar aquí");
}

// ═══════════════════════════════════════════════════════════════
// HELPERS — Telegram
// ═══════════════════════════════════════════════════════════════

const enviarMensaje = async (chatId: string, text: string, replyMarkup?: any) => {
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
          await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: currentChunk.trim(),
            parse_mode: "Markdown",
          });
        } catch (err) {
          functions.logger.warn("[espontaneo] Error enviando chunk:", err);
        }
      }
      currentChunk = p + "\n\n";
    } else {
      currentChunk += p + "\n\n";
    }
  }

  if (currentChunk.trim().length > 0) {
    try {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: currentChunk.trim(),
        parse_mode: "Markdown",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } catch (err) {
      functions.logger.warn("[espontaneo] Error enviando chunk final:", err);
    }
  }
};

async function enviarCarruselTelegram(
  chatId: string,
  contenido: ContenidoGeneradoIA,
  imageUrls: string[],
  postId: string
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  const base = `https://api.telegram.org/bot${botToken}`;

  try {
    // 1. Enviar el álbum de imágenes (hasta 10)
    const media = imageUrls.slice(0, 10).map((url, i) => ({
      type: "photo",
      media: url,
      caption: i === 0 ? `🎨 *${contenido.titulo_gancho}*` : undefined,
      parse_mode: i === 0 ? "Markdown" : undefined,
    }));

    await axios.post(`${base}/sendMediaGroup`, { chat_id: chatId, media });

    // 2. Enviar el copy como mensaje separado
    const mensajeCopy =
      `📝 *Copy para Instagram:*\n\n${contenido.copy_instagram}\n\n` +
      `🏷️ *Hashtags:*\n${contenido.hashtags}\n\n` +
      `✅ *Estado:* PENDIENTE de aprobación\n` +
      `🆔 *ID Post:* \`${postId}\``;

    await axios.post(`${base}/sendMessage`, {
      chat_id: chatId,
      text: mensajeCopy,
      parse_mode: "Markdown",
    });

    functions.logger.info(`[espontaneo] Carrusel enviado a Telegram chat_id: ${chatId}`);
  } catch (err) {
    functions.logger.error("[espontaneo] Error enviando carrusel a Telegram:", err);
  }
}
