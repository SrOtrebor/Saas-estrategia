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
  .runWith({ timeoutSeconds: 300, memory: "1GB" })
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
      // Limpiar markdown si Gemini devuelve ```json ... ```
      rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      IA = JSON.parse(rawText);
    } catch (err) {
      functions.logger.error("Error parseando JSON de Gemini. Raw text:", geminiResponse.text);
      throw new Error("Respuesta de Gemini no es JSON válido");
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
        inline_keyboard: [[{ text: "💾 Desarrollar y guardar en Docs", callback_data: "aprobar_ideas" }]]
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

    for (let i = 0; i < totalSlides; i++) {
      const fondoBuffer = await generarFondoImagen4(
        ai,
        generarPromptFondo(slides[i], marca.datos_negocio.rubro)
      );

      const slideBuffer = await componerSlide(
        fondoBuffer,
        slides[i],
        i + 1,
        totalSlides,
        marca.identidad_visual.color_primario_hex,
        marca.nombre_comercial,
        marca.identidad_visual.logo_url
      );

      const bucket = admin.storage().bucket();
      const fileName = `posts/${ingesta.id_marca}/${ingestaId}/slide_${i + 1}.png`;
      const publicUrl = await subirConReintentos(bucket, fileName, slideBuffer);
      imageUrls.push(publicUrl);
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

Respondé SOLO con este JSON estricto (sin markdown de json):
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

function generarPromptFondo(_textoSlide: string, _rubro: string): string {
  return (
    "A stunning, highly aesthetic background photograph for a luxury corporate brand. " +
    "Deep rich dark tones (navy, charcoal, subtle steel blue), architectural minimalism, " +
    "beautiful studio lighting, moody atmosphere, subtle gradients. " +
    "IMPORTANT: Keep the center almost completely empty and clean (abundant negative space) " +
    "so text can be easily read on top. " +
    "ABSOLUTELY ZERO TEXT, zero typography, zero letters, zero numbers. " +
    "No faces. Photorealistic, 8k resolution, 1:1 square format."
  );
}

async function generarFondoImagen4(ai: GoogleGenAI, prompt: string): Promise<Buffer> {
  try {
    const response = await ai.models.generateImages({
      model: "imagen-4.0-fast-generate-001",
      prompt,
      config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio: "1:1" },
    });
    const bytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (!bytes) throw new Error("Imagen vacía");
    return Buffer.from(bytes, "base64");
  } catch (err) {
    functions.logger.warn("[espontaneo] Imagen 4 falló, usando fallback de color:", err);
    // Fallback: fondo de color sólido
    return sharp({
      create: { width: 1080, height: 1080, channels: 3, background: { r: 40, g: 40, b: 50 } },
    }).jpeg().toBuffer();
  }
}

function escaparXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function dividirTexto(texto: string, maxChars: number): string[] {
  const palabras = texto.split(" ");
  const lineas: string[] = [];
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

async function componerSlide(
  fondoBuffer: Buffer,
  texto: string,
  nSlide: number,
  totalSlides: number,
  colorPrimario: string,
  nombreMarca: string,
  logoUrl?: string
): Promise<Buffer> {
  const fondo = await sharp(fondoBuffer).resize(1080, 1080, { fit: "cover" }).toBuffer();

  const lineas = dividirTexto(texto, 15);
  const lh = 85;
  const lineaCount = lineas.length;

  // DIMENSIONES DE LA "TARJETA ELEGANTE"
  const cardW = 900;
  const cardH = lineaCount * lh + 140;
  const cardX = (1080 - cardW) / 2;
  const cardY = (1080 - cardH) / 2 - 20; // Ligeramente por encima del centro

  const y0 = cardY + 90; // Posición de la primera línea de texto dentro de la tarjeta

  const textoSVG = lineas.map((l, i) =>
    `<text x="540" y="${y0 + i * lh}"
      font-family="Georgia, serif" font-size="68" font-weight="bold"
      fill="#FFFFFF" text-anchor="middle" letter-spacing="1">${escaparXML(l)}</text>`
  ).join("\n");

  // Dots de navegación — centrados abajo
  const puntos = Array.from({ length: totalSlides }, (_, i) => {
    const cx = 540 - ((totalSlides - 1) * 26) / 2 + i * 26;
    return `<circle cx="${cx}" cy="960" r="${i === nSlide - 1 ? 8 : 4}"
      fill="#FFF" fill-opacity="${i === nSlide - 1 ? 1 : 0.4}" />`;
  }).join("\n");

  // Marca fallback (solo si no hay logo)
  const tieneLogoReal = logoUrl && !logoUrl.includes("placeholder") && !logoUrl.includes("LOGO");
  const marcaFallback = tieneLogoReal
    ? ""
    : `<text x="540" y="1032" font-family="Arial, sans-serif" font-size="24" font-weight="600"
        fill="#FFF" fill-opacity="0.85" letter-spacing="4" text-anchor="middle"
        >${escaparXML(nombreMarca.toUpperCase())}</text>`;

  const overlay = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Filtro de sombra paralela sutil para la tarjeta -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="15" stdDeviation="25" flood-color="#000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Viñeteado radial suave -->
  <rect width="1080" height="1080" fill="#000" fill-opacity="0.2"/>

  <!-- Barra de color primario súper delgada arriba -->
  <rect x="0" y="0" width="1080" height="6" fill="${colorPrimario}"/>

  <!-- Contador de slides minimalista (top right) -->
  <text x="1000" y="80" font-family="Arial, sans-serif" font-size="24" font-weight="500"
    fill="#FFF" fill-opacity="0.6" text-anchor="end">${nSlide} / ${totalSlides}</text>

  <!-- TARJETA ELEGANTE (Glass/Solid) -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30"
    fill="#0A0B10" fill-opacity="0.75" 
    stroke="${colorPrimario}" stroke-width="2" stroke-opacity="0.8"
    filter="url(#shadow)"/>

  <!-- Decoración pequeña arriba del texto en la tarjeta -->
  <rect x="510" y="${cardY + 35}" width="60" height="4" rx="2" fill="${colorPrimario}"/>

  <!-- Texto principal -->
  ${textoSVG}

  <!-- Marca fallback -->
  ${marcaFallback}

  <!-- Dots de navegación -->
  ${puntos}
</svg>`;

  // Base: fondo + overlay SVG
  let base = await sharp(fondo)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .toBuffer();

  // ─── Logo centrado abajo ─────────────────────────────────────
  if (tieneLogoReal) {
    try {
      const logoRes = await axios.get(logoUrl!, {
        responseType: "arraybuffer",
        timeout: 10000,
      });
      const logoRaw = Buffer.from(logoRes.data as ArrayBuffer);

      // Redimensionar: máx 280px ancho, máx 100px alto
      const logoResized = await sharp(logoRaw)
        .resize(280, 100, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();

      const meta = await sharp(logoResized).metadata();
      const logoW = meta.width ?? 280;
      const logoH = meta.height ?? 100;

      // Posición: centrado horizontal, y=990 (abajo, encima del borde)
      const logoLeft = Math.round((1080 - logoW) / 2);
      const logoTop  = 990 - logoH;

      // Píldora semitransparente detrás del logo
      const padX = 32, padY = 16;
      const pillW = logoW + padX * 2;
      const pillH = logoH + padY * 2;
      const pillLeft = Math.round((1080 - pillW) / 2);
      const pillTop  = logoTop - padY;
      const rx = Math.round(pillH / 2);

      const pill = Buffer.from(
        `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${pillW}" height="${pillH}" rx="${rx}" fill="#000000" fill-opacity="0.38"/>
        </svg>`
      );

      base = await sharp(base)
        .composite([
          { input: pill,        top: pillTop,  left: pillLeft },
          { input: logoResized, top: logoTop,  left: logoLeft },
        ])
        .toBuffer();

      functions.logger.info(`[espontaneo] Logo superpuesto: ${logoW}x${logoH}px`);
    } catch (err) {
      functions.logger.warn("[espontaneo] No se pudo superponer el logo:", err);
      // Continua sin logo — el nombre en texto ya está en el overlay
    }
  }

  return sharp(base).png({ quality: 92 }).toBuffer();
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
  
  // Dividir el mensaje por párrafos para no romper el Markdown
  const paragraphs = text.split("\n\n");
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
