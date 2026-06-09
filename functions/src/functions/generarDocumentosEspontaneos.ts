import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { MarcaConfig } from "../interfaces";
import { requireEnv } from "../lib/envValidator";
import { agregarGuionADocumentoExistente } from "../lib/googleDocs";

export const generarDocumentosEspontaneos = functions
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
    if (!marcaDoc.exists) return;
    const marca = marcaDoc.data() as MarcaConfig;

    // ─── Paso 1: Generar expansión con Gemini 2.5 Flash ────────
    const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
    
    let instruccionSeleccion = "Expande TODAS las ideas mencionadas en el texto.";
    if (opcion === "docs_idea_1") instruccionSeleccion = "Filtra y expande ÚNICAMENTE la PRIMERA idea o viñeta mencionada en el texto. IGNORA la segunda idea y las demás.";
    if (opcion === "docs_idea_2") instruccionSeleccion = "Filtra y expande ÚNICAMENTE la SEGUNDA idea o viñeta mencionada en el texto. IGNORA la primera idea y las demás.";

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
    } catch (err) {
      functions.logger.error("[docs] Error llamando a Gemini:", err);
      contenidoExpandido = "Ocurrió un error al intentar expandir las ideas con IA.";
    }

    // ─── Paso 2: Crear el Google Doc en la carpeta del cliente ─────────
    let docUrl = "";
    try {
      const titulo = `[GUIONES] ${marca.nombre_comercial} - ${new Date().toLocaleDateString("es-AR")}`;
      docUrl = await agregarGuionADocumentoExistente(marca.google_doc_id || "", titulo, contenidoExpandido);
    } catch (err) {
      functions.logger.error("[docs] Error creando Google Doc:", err);
    }

    // ─── Paso 3: Avisar por Telegram ──────────────────────────
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      let mensajeFinal = "";
      if (docUrl) {
        mensajeFinal = `✅ *Ideas expandidas exitosamente.*\n\nGuiones desarrollados y guardados en Drive:\n[Abrir Google Docs](${docUrl})`;
      } else {
        mensajeFinal = `⚠️ Hubo un problema creando el Google Doc (¿Configuraste GOOGLE_DRIVE_FOLDER_ID?), pero aquí tienes el contenido expandido:\n\n${contenidoExpandido.substring(0, 3000)}`;
      }

      try {
        // Sanitizamos el markdown del texto final por si contiene viñetas con asterisco suelto
        let safeMensaje = mensajeFinal.replace(/(^|\n)\s*\*\s/g, "$1- ");
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: chatId,
          text: safeMensaje,
          parse_mode: "Markdown",
        });
      } catch (e) {
        functions.logger.warn("[docs] Error enviando link de Docs a Telegram, intentando sin Markdown:", e);
        try {
          await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: `⚠️ Hubo un error de formato enviando el mensaje largo. Entrá a tu Google Drive para ver el documento creado, o revisá los logs de Firebase si falló.`,
          });
        } catch (e2) {}
      }
    }

    // Limpiar la cola
    await snap.ref.delete();
  });
