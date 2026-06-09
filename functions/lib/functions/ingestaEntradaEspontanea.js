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
    const update = req.body;
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
                await axios_1.default.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                    callback_query_id: callbackQuery.id,
                    text: isAprobar ? "Sincronizando con Google Sheets y Aprobando..." : "Procesando...",
                });
            }
            catch (e) { }
        }
        const db = admin.firestore();
        if (isDocs) {
            const opcion = data;
            const textoOriginal = callbackQuery.message?.text || "";
            const marcasSnap = await db.collection("marcas")
                .where("credenciales_redes.telegram_chat_id", "==", chatId).limit(1).get();
            if (!marcasSnap.empty) {
                const marca = marcasSnap.docs[0].data();
                await db.collection("cola_docs").add({
                    id_marca: marca.id_marca,
                    chat_id: chatId,
                    texto_ideas: textoOriginal,
                    opcion: opcion,
                    created_at: firestore_1.Timestamp.now()
                });
                functions.logger.info(`[ingesta] Encolado en /cola_docs para ${marca.nombre_comercial}`);
            }
        }
        else if (isAprobar) {
            const postId = data.replace("aprobar_post_", "");
            functions.logger.info(`[ingesta] Recibido aprobar_post_ para postId: ${postId}`);
            const updateData = {
                estado: "APROBADO",
                updated_at: firestore_1.Timestamp.now(),
            };
            // 2. Actualizar estado y textos en Firestore
            try {
                await db.collection("planificador_contenido").doc(postId).update(updateData);
                functions.logger.info(`[ingesta] Post ${postId} marcado como APROBADO en Firestore.`);
                // 4. Avisar por Telegram editando el mensaje original (quitar el botón)
                if (botToken && callbackQuery.message) {
                    await axios_1.default.post(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        text: callbackQuery.message.text + "\n\n✅ *POST APROBADO. Se publicará en el horario programado.*",
                        parse_mode: "Markdown",
                    });
                }
            }
            catch (error) {
                functions.logger.error(`[ingesta] Error aprobando post ${postId}: ${error.message}`);
            }
        }
        else if (isGenerar) {
            const idBoceto = data.replace("generar_post_", "");
            functions.logger.info(`[ingesta] Recibido generar_post_ para id_boceto: ${idBoceto}`);
            const marcasSnap = await db.collection("marcas")
                .where("credenciales_redes.telegram_chat_id", "==", chatId).limit(1).get();
            if (!marcasSnap.empty) {
                const marca = marcasSnap.docs[0].data();
                const bocetoDoc = await db.collection("banco_ideas").doc(idBoceto).get();
                if (bocetoDoc.exists) {
                    const boceto = bocetoDoc.data();
                    if (boceto?.procesado) {
                        if (botToken) {
                            await axios_1.default.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                                callback_query_id: callbackQuery.id,
                                text: "Esta idea ya está en proceso o ya fue generada.",
                                show_alert: true
                            }).catch(() => { });
                        }
                        res.status(200).send("OK");
                        return;
                    }
                    // Marcar como procesado
                    await db.collection("banco_ideas").doc(idBoceto).update({ procesado: true });
                    if (botToken) {
                        // Avisamos en un mensaje nuevo que empezamos a trabajar
                        await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            chat_id: chatId,
                            text: `⏳ *¡Manos a la obra! Generando contenido para: ${boceto?.titulo_corto}...*`,
                            parse_mode: "Markdown",
                        }).catch(err => functions.logger.error("Error enviando mensaje", err.response?.data || err));
                    }
                    // Encolamos en Firestore para no bloquear el webhook
                    await db.collection("cola_generacion_menu").add({
                        id_boceto: idBoceto,
                        chat_id: chatId,
                        created_at: firestore_1.Timestamp.now()
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
        // ─── Paso 0: Comando de vinculación ───────────────────────
        if (message.text && message.text.trim().startsWith("/vincular")) {
            const marcaIdStr = message.text.replace("/vincular", "").trim();
            if (!marcaIdStr) {
                await enviarMensaje(chatId, "⚠️ Tenés que escribir el comando así: /vincular ID_MARCA");
                res.status(200).send("OK");
                return;
            }
            const marcaDoc = await db.collection("marcas").doc(marcaIdStr).get();
            if (!marcaDoc.exists) {
                await enviarMensaje(chatId, `❌ No existe ninguna marca con el ID "${marcaIdStr}". Revisá el Dashboard.`);
                res.status(200).send("OK");
                return;
            }
            await db.collection("marcas").doc(marcaIdStr).set({
                credenciales_redes: { telegram_chat_id: chatId }
            }, { merge: true });
            await enviarMensaje(chatId, `✅ ¡Éxito! Este chat quedó vinculado a la marca: *${marcaDoc.data()?.nombre_comercial}*. Ya podés mandarme audios, textos o fotos con ideas.`);
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
                created_at: firestore_1.Timestamp.now()
            });
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
        await enviarMensaje(chatId, `✅ *Recibido.* Procesando tu solicitud... 🧠`);
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