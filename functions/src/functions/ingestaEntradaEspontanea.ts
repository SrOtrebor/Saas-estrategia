/**
 * ingestaEntradaEspontanea.ts
 * ─────────────────────────────────────────────────────────────
 * Webhook HTTPS que recibe mensajes del bot @EstudioPrecintoBot.
 *
 * Flujo:
 *   1. Valida el secret header de Telegram
 *   2. Detecta tipo de payload: texto, link, foto o nota de voz
 *   3. Si es voz → transcribe con Gemini (multimodal, sin costo extra)
 *   4. Identifica la marca por telegram_chat_id en Firestore
 *   5. Crea doc en /cola_ingesta → dispara generarContenidoEspontaneo
 *   6. Responde inmediatamente al usuario con mensaje de confirmación
 * ─────────────────────────────────────────────────────────────
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { MarcaConfig, IngestaPayload } from "../interfaces";

// ═══════════════════════════════════════════════════════════════
// TIPOS — Estructura del payload de Telegram
// ═══════════════════════════════════════════════════════════════

interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramVoice {
  file_id: string;
  file_size?: number;
  duration: number;
  mime_type?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  voice?: TelegramVoice;
  photo?: TelegramPhotoSize[];
  entities?: Array<{ type: string; offset: number; length: number }>;
}

interface TelegramCallbackQuery {
  id: string;
  data: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ═══════════════════════════════════════════════════════════════
// CLOUD FUNCTION: ingestaEntradaEspontanea (HTTPS Webhook)
// ═══════════════════════════════════════════════════════════════

export const ingestaEntradaEspontanea = functions
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onRequest(async (req, res) => {

    // ─── Solo POST ────────────────────────────────────────────
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // ─── Validar secret de Telegram ──────────────────────────
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    const headerToken = req.headers["x-telegram-bot-api-secret-token"];

    if (secretToken && headerToken !== secretToken) {
      functions.logger.warn("[ingesta] Secret inválido — solicitud rechazada.");
      res.status(401).send("Unauthorized");
      return;
    }

    const update = req.body as TelegramUpdate;
    let message = update.message;
    const callbackQuery = update.callback_query;

    if (callbackQuery) {
      const chatId = callbackQuery.message?.chat.id.toString();
      if (!chatId) {
        res.status(200).send("OK");
        return;
      }
      
      // Responder al callback query para quitar el "relojito" en Telegram
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        try {
          await axios.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: "Expandiendo ideas en Google Docs...",
          });
        } catch (e) {}
      }

      if (callbackQuery.data === "aprobar_ideas") {
        const textoOriginal = callbackQuery.message?.text || "";
        const db = admin.firestore();
        
        // Identificar la marca
        const marcasSnap = await db
          .collection("marcas")
          .where("credenciales_redes.telegram_chat_id", "==", chatId)
          .limit(1)
          .get();
          
        if (!marcasSnap.empty) {
          const marca = marcasSnap.docs[0].data() as MarcaConfig;
          await db.collection("cola_docs").add({
            id_marca: marca.id_marca,
            chat_id: chatId,
            texto_ideas: textoOriginal,
            created_at: Timestamp.now()
          });
          functions.logger.info(`[ingesta] Encolado en /cola_docs para ${marca.nombre_comercial}`);
        }
      }
      res.status(200).send("OK");
      return;
    }

    if (!message) {
      // Otros tipos de update — ignorar
      res.status(200).send("OK");
      return;
    }

    const chatId = message.chat.id.toString();
    functions.logger.info(`[ingesta] Mensaje recibido. chat_id: ${chatId}`);

    try {
      // ─── Paso 1: Identificar la marca por telegram_chat_id ──
      const db = admin.firestore();
      const marcasSnap = await db
        .collection("marcas")
        .where("credenciales_redes.telegram_chat_id", "==", chatId)
        .limit(1)
        .get();

      if (marcasSnap.empty) {
        functions.logger.warn(`[ingesta] Ninguna marca asociada al chat_id: ${chatId}`);
        // Aviso amigable para que sepa que el bot recibió el mensaje
        await enviarMensaje(chatId, "⚠️ Este chat no está vinculado a ninguna marca. Consultá con el administrador.");
        res.status(200).send("OK");
        return;
      }

      const marca = marcasSnap.docs[0].data() as MarcaConfig;
      functions.logger.info(`[ingesta] Marca identificada: ${marca.nombre_comercial}`);

      // ─── Paso 2: Detectar tipo de payload ───────────────────
      let tipo: IngestaPayload["tipo"];
      let contenidoRaw: string;

      if (message.voice) {
        // CASO: Nota de voz → transcribir con Gemini multimodal
        functions.logger.info("[ingesta] Nota de voz — iniciando transcripción con Gemini...");
        await enviarMensaje(chatId, "🎙️ Escuchando tu nota de voz...");
        contenidoRaw = await transcribirVozConGemini(message.voice);
        tipo = "audio";
        functions.logger.info(`[ingesta] Transcripción: "${contenidoRaw.substring(0, 80)}..."`);

      } else if (message.photo) {
        // CASO: Foto → usar caption como contexto + referencia visual
        const caption = message.caption ?? "foto enviada desde Telegram";
        tipo = "texto";
        contenidoRaw = `[Foto enviada] ${caption}`;

      } else if (message.text) {
        // CASO: Texto o link
        const esLink =
          message.entities?.some((e) => e.type === "url") ||
          message.text!.startsWith("http");
        tipo = esLink ? "link" : "texto";
        contenidoRaw = message.text;

      } else {
        functions.logger.warn(`[ingesta] Tipo de mensaje no soportado. chat_id: ${chatId}`);
        await enviarMensaje(chatId, "⚠️ Solo acepto texto, notas de voz y fotos. ¡Intentá de nuevo!");
        res.status(200).send("OK");
        return;
      }

      // ─── Paso 3: Encolar en Firestore ───────────────────────
      const payload: IngestaPayload = {
        id_marca: marca.id_marca,
        tipo,
        contenido_raw: contenidoRaw,
        created_at: Timestamp.now(),
      };

      const docRef = await db.collection("cola_ingesta").add(payload);
      functions.logger.info(`[ingesta] Encolado en /cola_ingesta/${docRef.id} para ${marca.nombre_comercial}`);

      // ─── Paso 4: Confirmación al usuario ────────────────────
      await enviarMensaje(
        chatId,
        `✅ *Recibido.* Procesando tu solicitud... 🧠`
      );

      res.status(200).send("OK");

    } catch (error) {
      functions.logger.error("[ingesta] Error procesando webhook:", error);
      // Siempre 200 a Telegram para evitar reintentos infinitos
      res.status(200).send("OK");
    }
  });

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Transcribe una nota de voz usando Gemini 2.5 Flash (multimodal).
 * Descarga el audio desde Telegram y lo envía inline a Gemini.
 */
async function transcribirVozConGemini(voice: TelegramVoice): Promise<string> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN no configurado");

  // 1. Obtener URL de descarga del archivo desde Telegram
  const fileInfoRes = await axios.get(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${voice.file_id}`
  );
  const filePath: string = fileInfoRes.data.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  // 2. Descargar el audio como buffer
  const audioRes = await axios.get(downloadUrl, { responseType: "arraybuffer" });
  const audioBase64 = Buffer.from(audioRes.data).toString("base64");
  const mimeType = voice.mime_type ?? "audio/ogg";

  // 3. Transcribir con Gemini multimodal (sin costo extra de API)
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      parts: [
        { text: "Transcribí este mensaje de voz al texto, en el idioma original. Devolvé SOLO la transcripción, sin explicaciones ni comentarios." },
        { inlineData: { mimeType, data: audioBase64 } },
      ],
    }],
  });

  return response.text?.trim() ?? "[No se pudo transcribir]";
}

/**
 * Envía un mensaje de texto al chat vía Telegram Bot API.
 */
async function enviarMensaje(chatId: string, texto: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: texto,
      parse_mode: "Markdown",
    });
  } catch (err) {
    functions.logger.warn("[ingesta] No se pudo enviar mensaje de confirmación:", err);
  }
}
