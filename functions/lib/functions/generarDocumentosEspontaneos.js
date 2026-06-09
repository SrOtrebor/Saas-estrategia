"use strict";
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
exports.generarDocumentosEspontaneos = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const genai_1 = require("@google/genai");
const googleDocs_1 = require("../lib/googleDocs");
exports.generarDocumentosEspontaneos = functions
    .runWith({ timeoutSeconds: 300, memory: "1GB" })
    .firestore.document("cola_docs/{docId}")
    .onCreate(async (snap, context) => {
    const docData = snap.data();
    const idMarca = docData.id_marca;
    const chatId = docData.chat_id;
    const textoIdeas = docData.texto_ideas;
    const opcion = docData.opcion || "docs_todas";
    functions.logger.info(`[docs] Procesando expansión de ideas para marca ${idMarca}`);
    const db = admin.firestore();
    const marcaDoc = await db.collection("marcas").doc(idMarca).get();
    if (!marcaDoc.exists)
        return;
    const marca = marcaDoc.data();
    // ─── Paso 1: Generar expansión con Gemini 2.5 Flash ────────
    const ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let instruccionSeleccion = "Expande TODAS las ideas mencionadas en el texto.";
    if (opcion === "docs_idea_1")
        instruccionSeleccion = "Filtra y expande ÚNICAMENTE la PRIMERA idea o viñeta mencionada en el texto. IGNORA la segunda idea y las demás.";
    if (opcion === "docs_idea_2")
        instruccionSeleccion = "Filtra y expande ÚNICAMENTE la SEGUNDA idea o viñeta mencionada en el texto. IGNORA la primera idea y las demás.";
    const prompt = `Sos un COPYWRITER SENIOR y ESTRATEGA DE MARKETING para la marca ${marca.nombre_comercial} (Rubro: ${marca.datos_negocio.rubro}).

El usuario ha aprobado las siguientes ideas/premisas resumidas:
"${textoIdeas}"

TU TAREA:
${instruccionSeleccion}
Tomar la(s) premisa(s) seleccionada(s) y expandirla(s) en guiones completos, detallados y listos para grabar o usar. 
Desarrolla el contenido de forma profesional, usando el tono de voz de la marca: ${marca.comunicacion.tono_de_voz}.
Agrega estructuras claras (Hook, Retención, Llamado a la Acción).
No devuelvas JSON, devuelve un texto en formato Markdown rico y estructurado.`;
    let contenidoExpandido = "";
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ parts: [{ text: prompt }] }],
        });
        contenidoExpandido = response.text || "[Hubo un error al generar el contenido]";
    }
    catch (err) {
        functions.logger.error("[docs] Error llamando a Gemini:", err);
        contenidoExpandido = "Ocurrió un error al intentar expandir las ideas con IA.";
    }
    // ─── Paso 2: Crear el Google Doc en la carpeta del cliente ─────────
    let docUrl = "";
    try {
        const titulo = `[GUIONES] ${marca.nombre_comercial} - ${new Date().toLocaleDateString("es-AR")}`;
        docUrl = await (0, googleDocs_1.agregarGuionADocumentoExistente)(marca.google_doc_id || "", titulo, contenidoExpandido);
    }
    catch (err) {
        functions.logger.error("[docs] Error creando Google Doc:", err);
    }
    // ─── Paso 3: Avisar por Telegram ──────────────────────────
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
        let mensajeFinal = "";
        if (docUrl) {
            mensajeFinal = `✅ *Ideas expandidas exitosamente.*\n\nGuiones desarrollados y guardados en Drive:\n[Abrir Google Docs](${docUrl})`;
        }
        else {
            mensajeFinal = `⚠️ Hubo un problema creando el Google Doc (¿Configuraste GOOGLE_DRIVE_FOLDER_ID?), pero aquí tienes el contenido expandido:\n\n${contenidoExpandido.substring(0, 3000)}`;
        }
        try {
            // Sanitizamos el markdown del texto final por si contiene viñetas con asterisco suelto
            let safeMensaje = mensajeFinal.replace(/(^|\n)\s*\*\s/g, "$1- ");
            await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                chat_id: chatId,
                text: safeMensaje,
                parse_mode: "Markdown",
            });
        }
        catch (e) {
            functions.logger.warn("[docs] Error enviando link de Docs a Telegram, intentando sin Markdown:", e);
            try {
                await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId,
                    text: `⚠️ Hubo un error de formato enviando el mensaje largo. Entrá a tu Google Drive para ver el documento creado, o revisá los logs de Firebase si falló.`,
                });
            }
            catch (e2) { }
        }
    }
    // Limpiar la cola
    await snap.ref.delete();
});
//# sourceMappingURL=generarDocumentosEspontaneos.js.map