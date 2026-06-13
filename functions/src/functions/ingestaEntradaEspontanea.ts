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
import { generarYGuardarContenido, proponerIdeasSemanales } from "./generarContenidoEstrategico";
import { requireEnv } from "../lib/envValidator";

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

    // ─── Validar secret de Telegram (OBLIGATORIO) ──────────────
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    const headerToken = req.headers["x-telegram-bot-api-secret-token"];

    if (!secretToken) {
      // Si no hay secret configurado, la función está mal configurada — rechazar
      functions.logger.error("[ingesta] TELEGRAM_WEBHOOK_SECRET no configurado. Función rechazará todas las solicitudes.");
      res.status(500).send("Internal Server Error: Missing webhook secret");
      return;
    }

    if (headerToken !== secretToken) {
      functions.logger.warn("[ingesta] Secret inválido — solicitud rechazada.");
      res.status(401).send("Unauthorized");
      return;
    }

    const update = req.body as TelegramUpdate;
    // Log mínimo: solo el tipo de update, sin exponer contenido del mensaje
    functions.logger.info("[ingesta] Update recibido:", { update_id: update.update_id, tipo: update.message ? "message" : update.callback_query ? "callback_query" : "otro" });
    let message = update.message;
    const callbackQuery = update.callback_query;

    if (callbackQuery) {
      const chatId = callbackQuery.message?.chat.id.toString();
      if (!chatId) {
        res.status(200).send("OK");
        return;
      }
      
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const data = callbackQuery.data || "";
      const isAprobar = data.startsWith("aprobar_post_");
      const isDocs = data.startsWith("docs_");
      const isGenerar = data.startsWith("generar_post_");

      if (botToken) {
        try {
          await axios.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: isAprobar ? "Sincronizando con Google Sheets y Aprobando..." : "Procesando...",
          });
        } catch (e) {}
      }

      const db = admin.firestore();

      if (isDocs) {
        const opcion = data; 
        const textoOriginal = callbackQuery.message?.text || "";
        
        const marcasSnap = await db.collection("marcas")
          .where("credenciales_redes.telegram_chat_id", "==", chatId).limit(1).get();
          
        if (!marcasSnap.empty) {
          const marca = marcasSnap.docs[0].data() as MarcaConfig;
          await db.collection("cola_docs").add({
            id_marca: marca.id_marca,
            chat_id: chatId,
            texto_ideas: textoOriginal,
            opcion: opcion,
            created_at: Timestamp.now()
          });
          functions.logger.info(`[ingesta] Encolado en /cola_docs para ${marca.nombre_comercial}`);
        }
      } else if (isAprobar) {
        const postId = data.replace("aprobar_post_", "");
        functions.logger.info(`[ingesta] Recibido aprobar_post_ para postId: ${postId}`);
        
        const updateData: any = {
          estado: "APROBADO",
          updated_at: Timestamp.now(),
        };

        // 2. Actualizar estado y textos en Firestore
        try {
          await db.collection("planificador_contenido").doc(postId).update(updateData);
          functions.logger.info(`[ingesta] Post ${postId} marcado como APROBADO en Firestore.`);

          // 4. Avisar por Telegram editando el mensaje original (quitar el botón)
          if (botToken && callbackQuery.message) {
            await axios.post(`https://api.telegram.org/bot${botToken}/editMessageText`, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id,
              text: callbackQuery.message.text + "\n\n✅ *POST APROBADO. Se publicará en el horario programado.*",
              parse_mode: "Markdown",
            });
          }
        } catch (error: any) {
          functions.logger.error(`[ingesta] Error aprobando post ${postId}: ${error.message}`);
        }
      } else if (isGenerar) {
        const idBoceto = data.replace("generar_post_", "");
        functions.logger.info(`[ingesta] Recibido generar_post_ para id_boceto: ${idBoceto}`);
        
        const marcasSnap = await db.collection("marcas")
          .where("credenciales_redes.telegram_chat_id", "==", chatId).limit(1).get();
          
        if (!marcasSnap.empty) {
          const marca = marcasSnap.docs[0].data() as MarcaConfig;
          const bocetoDoc = await db.collection("banco_ideas").doc(idBoceto).get();
          
          if (bocetoDoc.exists) {
            const boceto = bocetoDoc.data();
            
            if (boceto?.procesado) {
              if (botToken) {
                await axios.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                  callback_query_id: callbackQuery.id,
                  text: "Esta idea ya está en proceso o ya fue generada.",
                  show_alert: true
                }).catch(() => {});
              }
              res.status(200).send("OK");
              return;
            }
            
            // Marcar como procesado
            await db.collection("banco_ideas").doc(idBoceto).update({ procesado: true });
            
            if (botToken) {
              // Avisamos en un mensaje nuevo que empezamos a trabajar
              await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                chat_id: chatId,
                text: `⏳ *¡Manos a la obra! Generando contenido para: ${boceto?.titulo_corto}...*`,
                parse_mode: "Markdown",
              }).catch(err => functions.logger.error("Error enviando mensaje", err.response?.data || err));
            }

            // Encolamos en Firestore para no bloquear el webhook
            await db.collection("cola_generacion_menu").add({
              id_boceto: idBoceto,
              chat_id: chatId,
              created_at: Timestamp.now()
            });
            functions.logger.info(`[ingesta] Tarea de generación encolada para boceto ${idBoceto}`);
          }
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
      const db = admin.firestore();

      // ─── Paso 0.5: Rate Limiting (Seguridad) ────────────────────
      const rateLimitRef = db.collection("rate_limits").doc(chatId);
      const rateLimitDoc = await rateLimitRef.get();
      const ahoraLimit = Date.now();
      
      if (rateLimitDoc.exists) {
        const dataRL = rateLimitDoc.data();
        if (ahoraLimit - dataRL!.timestamp < 60000) {
          if (dataRL!.count >= 5) {
            // No enviar mensaje de alerta cada vez para no caer en spam, enviar solo en el límite
            if (dataRL!.count === 5) {
              await enviarMensaje(chatId, "⚠️ Límite de mensajes excedido. Por favor, esperá un minuto.");
            }
            await rateLimitRef.update({ count: admin.firestore.FieldValue.increment(1) });
            res.status(200).send("OK");
            return;
          }
          await rateLimitRef.update({ count: admin.firestore.FieldValue.increment(1) });
        } else {
          await rateLimitRef.set({ count: 1, timestamp: ahoraLimit });
        }
      } else {
        await rateLimitRef.set({ count: 1, timestamp: ahoraLimit });
      }

      // ─── Paso 0: Comando de vinculación ───────────────────────
      if (message.text && message.text.trim().startsWith("/vincular")) {
        const args = message.text.replace("/vincular", "").trim().split(" ");
        if (args.length !== 2) {
          await enviarMensaje(chatId, "⚠️ Tenés que escribir el comando así: /vincular ID_MARCA PIN");
          res.status(200).send("OK");
          return;
        }
        
        const marcaIdStr = args[0];
        const pinIngresado = args[1];

        const marcaDoc = await db.collection("marcas").doc(marcaIdStr).get();
        if (!marcaDoc.exists) {
          await enviarMensaje(chatId, `❌ No existe ninguna marca con el ID "${marcaIdStr}". Revisá el Dashboard.`);
          res.status(200).send("OK");
          return;
        }

        const dataMarca = marcaDoc.data();
        if (!dataMarca?.pin_vinculacion || dataMarca.pin_vinculacion !== pinIngresado) {
          await enviarMensaje(chatId, `❌ El PIN de vinculación es incorrecto o la marca no tiene PIN configurado.`);
          res.status(200).send("OK");
          return;
        }
        
        await db.collection("marcas").doc(marcaIdStr).set({
          credenciales_redes: { telegram_chat_id: chatId }
        }, { merge: true });
        
        await enviarMensaje(chatId, `✅ ¡Éxito! Este chat quedó vinculado a la marca: *${dataMarca?.nombre_comercial}*. Ya podés mandarme audios, textos o fotos con ideas.`);
        res.status(200).send("OK");
        return;
      }

      // ─── Paso 1: Identificar la marca por telegram_chat_id ──
      const marcasSnap = await db
        .collection("marcas")
        .where("credenciales_redes.telegram_chat_id", "==", chatId)
        .limit(1)
        .get();

      if (marcasSnap.empty) {
        functions.logger.warn(`[ingesta] Ninguna marca asociada al chat_id: ${chatId}`);
        // Aviso amigable para que sepa que el bot recibió el mensaje
        await enviarMensaje(chatId, "⚠️ Este chat no está vinculado a ninguna marca. Escribí /vincular seguido de tu ID de marca para conectarte (ej: /vincular mofit).");
        res.status(200).send("OK");
        return;
      }

      const marca = marcasSnap.docs[0].data() as MarcaConfig;
      functions.logger.info(`[ingesta] Marca identificada: ${marca.nombre_comercial}`);

      // ─── Paso 1.5: Comando de prueba ──────────────────────────
      if (message.text && message.text.trim() === "/test") {
        if (!marca.plantillas || marca.plantillas.length === 0) {
          await enviarMensaje(chatId, "⚠️ Este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para activar la generación visual.");
          res.status(200).send("OK");
          return;
        }
        await enviarMensaje(chatId, "🛠️ Ejecutando prueba de sistema completa (Texto -> Imágenes -> Google Sheets)...");
        const payload: IngestaPayload = {
          id_marca: marca.id_marca,
          tipo: "texto",
          contenido_raw: "Armá un carrusel gráfico de prueba sobre los beneficios de usar IA en los negocios.",
          created_at: Timestamp.now(),
        };
        await db.collection("cola_ingesta").add(payload);
        res.status(200).send("OK");
        return;
      }

      
      // ─── Paso 1.6: Comando de test de plantillas ──────────────
      if (message.text && message.text.trim() === "/test_plantillas") {
        if (!marca.plantillas || marca.plantillas.length === 0) {
          await enviarMensaje(chatId, "⚠️ Este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para activar la generación visual.");
          res.status(200).send("OK");
          return;
        }

        await enviarMensaje(chatId, "⏳ ¡Entendido! Generando muestrario con todas las plantillas. Esto puede demorar unos minutos, te las enviaré juntas apenas termine...");
        await db.collection("cola_test_plantillas").add({
          id_marca: marca.id_marca,
          chat_id: chatId,
          created_at: Timestamp.now()
        });
        res.status(200).send("OK");
        return;
      }

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

      // ─── Paso 2.5: Detectar si es un pedido de "Plan Semanal" ──
      const textoMinusculas = contenidoRaw.toLowerCase();
      const isPlanSemanal = textoMinusculas.includes("semana") || 
                            textoMinusculas.includes("seamana") || 
                            textoMinusculas.includes("grilla") || 
                            textoMinusculas.includes("plan");
      if (isPlanSemanal) {
        await enviarMensaje(chatId, "⏳ ¡Entendido! Estoy investigando tendencias y armando tu menú semanal de ideas. Esto tomará un par de minutos...");
        
        // Encolamos en Firestore para no bloquear el webhook
        await db.collection("cola_menu_semanal").add({
          id_marca: marca.id_marca,
          chat_id: chatId,
          created_at: Timestamp.now()
        });
        
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
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
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
