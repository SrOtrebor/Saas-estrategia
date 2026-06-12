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
import { MarcaConfig, ContenidoGeneradoIA, IngestaPayload, PosteoContenido } from "../interfaces";
import { FilaPlanificacion, actualizarPlanillaExistente } from "../lib/googleSheets";
import { generarCarrusel } from "../lib/imageGenerator";
import { requireEnv } from "../lib/envValidator";

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
    const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });

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
    const totalSlides = Math.min(slides.length, 6);
    // 1. Generar imágenes del carrusel usando el motor unificado de Puppeteer
    const imageUrls = await generarCarrusel(
      slides.slice(0, totalSlides),
      marca.identidad_visual,
      marca.nombre_comercial,
      ingesta.id_marca,
      ingestaId
    );

    if (imageUrls.length === 0) {
      await enviarMensaje(chatId, "⚠️ *Atención*: Este cliente no tiene plantillas cargadas. Por favor, ve al dashboard web y carga al menos una plantilla para generar las gráficas.");
      throw new Error("No hay plantillas cargadas para generar carrusel");
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
    try {
      const fila: FilaPlanificacion = {
        dia: contenidoIA.dia_semana || "Lunes",
        formato: contenidoIA.formato_recomendado,
        copy: contenidoIA.copy_instagram,
        hashtags: contenidoIA.hashtags || "",
        tipoEstrategia: contenidoIA.tipo_estrategia || "Contenido de Valor",
        linkContenido: imageUrls.length > 0 ? imageUrls.join(", ") : "PENDIENTE DE ARCHIVOS",
        estado: "Pendiente"
      };

      const sheetUrl = await actualizarPlanillaExistente(
        marca.google_sheet_id || "PENDIENTE",
        [fila]
      );

      // Enviar carrusel a Telegram
      await enviarCarruselTelegram(chatId, contenidoIA, imageUrls, postRef.id, sheetUrl);
    } catch (error) {
      functions.logger.error("[generarContenidoEspontaneo] Error escribiendo en Google Sheets", error);
      // Enviar carrusel a Telegram aunque falle Sheets
      await enviarCarruselTelegram(chatId, contenidoIA, imageUrls, postRef.id);
    }

    await snap.ref.delete(); // Limpiar cola
    functions.logger.info(`[espontaneo] ✅ Proceso de ejecución completo.`);
  });

// ═══════════════════════════════════════════════════════════════
// HELPERS — Generación de contenido
// ═══════════════════════════════════════════════════════════════

function construirPromptBot(marca: MarcaConfig, inputUsuario: string, historia: any[]): string {
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
Debes generar un MÁXIMO DE 6 DIAPOSITIVAS por carrusel. No escribas poco, pero tampoco satures la imagen. Queremos placas con INTENCIÓN, estilo consultoría premium. Usa SÓLO etiquetas HTML para la estructura:
- <h2> para la 'píldora' superior (categoría o etapa).
- <h1> para el gancho (muy impactante y controversial).
- <p> para párrafos descriptivos profundos (máximo 2 a 3 oraciones por placa, aprox 30-40 palabras para mantener diseño limpio).
- <ul> y <li> para viñetas (máximo 3 puntos).
- <div class='highlight'> para recuadros de remate abajo.`;
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
  postId: string,
  sheetUrl?: string
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
    let mensajeCopy =
      `📝 *Copy para Instagram:*\n\n${contenido.copy_instagram}\n\n` +
      `🏷️ *Hashtags:*\n${contenido.hashtags}\n\n` +
      `✅ *Estado:* PENDIENTE de aprobación\n` +
      `🆔 *ID Post:* \`${postId}\``;

    if (sheetUrl) {
      mensajeCopy += `\n\n📊 [Abrir Excel de Planificación](${sheetUrl})`;
    }

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
