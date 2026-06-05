"use strict";
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
exports.ingestaEntradaEspontanea = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const axios_1 = __importDefault(require("axios"));
const genai_1 = require("@google/genai");
// ═══════════════════════════════════════════════════════════════
// CLOUD FUNCTION: ingestaEntradaEspontanea (HTTPS Webhook)
// ═══════════════════════════════════════════════════════════════
exports.ingestaEntradaEspontanea = functions
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
    const update = req.body;
    const message = update.message;
    if (!message) {
        // Otros tipos de update (callback_query, etc.) — ignorar
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
        const marca = marcasSnap.docs[0].data();
        functions.logger.info(`[ingesta] Marca identificada: ${marca.nombre_comercial}`);
        // ─── Paso 2: Detectar tipo de payload ───────────────────
        let tipo;
        let contenidoRaw;
        if (message.voice) {
            // CASO: Nota de voz → transcribir con Gemini multimodal
            functions.logger.info("[ingesta] Nota de voz — iniciando transcripción con Gemini...");
            await enviarMensaje(chatId, "🎙️ Escuchando tu nota de voz...");
            contenidoRaw = await transcribirVozConGemini(message.voice);
            tipo = "audio";
            functions.logger.info(`[ingesta] Transcripción: "${contenidoRaw.substring(0, 80)}..."`);
        }
        else if (message.photo) {
            // CASO: Foto → usar caption como contexto + referencia visual
            const caption = message.caption ?? "foto enviada desde Telegram";
            tipo = "texto";
            contenidoRaw = `[Foto enviada] ${caption}`;
        }
        else if (message.text) {
            // CASO: Texto o link
            const esLink = message.entities?.some((e) => e.type === "url") ||
                message.text.startsWith("http");
            tipo = esLink ? "link" : "texto";
            contenidoRaw = message.text;
        }
        else {
            functions.logger.warn(`[ingesta] Tipo de mensaje no soportado. chat_id: ${chatId}`);
            await enviarMensaje(chatId, "⚠️ Solo acepto texto, notas de voz y fotos. ¡Intentá de nuevo!");
            res.status(200).send("OK");
            return;
        }
        // ─── Paso 3: Encolar en Firestore ───────────────────────
        const payload = {
            id_marca: marca.id_marca,
            tipo,
            contenido_raw: contenidoRaw,
            created_at: firestore_1.Timestamp.now(),
        };
        const docRef = await db.collection("cola_ingesta").add(payload);
        functions.logger.info(`[ingesta] Encolado en /cola_ingesta/${docRef.id} para ${marca.nombre_comercial}`);
        // ─── Paso 4: Confirmación al usuario ────────────────────
        await enviarMensaje(chatId, `✅ *¡Recibido!* Estoy generando el contenido para *${marca.nombre_comercial}*.\n\n` +
            `📝 *Input:* "${contenidoRaw.substring(0, 100)}${contenidoRaw.length > 100 ? "..." : ""}"\n\n` +
            `🤖 Gemini + Imagen 4 están trabajando. En unos segundos te mando el carrusel listo para revisar.`);
        res.status(200).send("OK");
    }
    catch (error) {
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
async function transcribirVozConGemini(voice) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken)
        throw new Error("TELEGRAM_BOT_TOKEN no configurado");
    // 1. Obtener URL de descarga del archivo desde Telegram
    const fileInfoRes = await axios_1.default.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${voice.file_id}`);
    const filePath = fileInfoRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    // 2. Descargar el audio como buffer
    const audioRes = await axios_1.default.get(downloadUrl, { responseType: "arraybuffer" });
    const audioBase64 = Buffer.from(audioRes.data).toString("base64");
    const mimeType = voice.mime_type ?? "audio/ogg";
    // 3. Transcribir con Gemini multimodal (sin costo extra de API)
    const ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
async function enviarMensaje(chatId, texto) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken)
        return;
    try {
        await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: texto,
            parse_mode: "Markdown",
        });
    }
    catch (err) {
        functions.logger.warn("[ingesta] No se pudo enviar mensaje de confirmación:", err);
    }
}
//# sourceMappingURL=ingestaEntradaEspontanea.js.map