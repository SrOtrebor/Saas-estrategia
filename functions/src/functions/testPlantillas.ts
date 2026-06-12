import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import axios from "axios";
import { generarMuestrarioPlantillas } from "../lib/imageGenerator";
import { MarcaConfig } from "../interfaces";

export const procesarTestPlantillas = functions
  .runWith({ timeoutSeconds: 300, memory: "1GB" })
  .firestore.document("cola_test_plantillas/{docId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { id_marca, chat_id } = data;
    const db = admin.firestore();

    const marcaDoc = await db.collection("marcas").doc(id_marca).get();
    if (!marcaDoc.exists) {
      functions.logger.error(`Marca ${id_marca} no encontrada`);
      return;
    }
    const marca = marcaDoc.data() as MarcaConfig;
    const identidad = marca.identidad_visual;

    try {
      // 1. Generar imágenes
      const urls = await generarMuestrarioPlantillas(identidad, id_marca);

      // 2. Enviar a Telegram como MediaGroup
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        if (urls.length > 0) {
          // Dividir en grupos de 10 fotos máximo por MediaGroup (límite de Telegram)
          const chunks = [];
          for (let i = 0; i < urls.length; i += 10) {
            chunks.push(urls.slice(i, i + 10));
          }

          for (const chunk of chunks) {
            const mediaGroup = chunk.map((url, index) => ({
              type: "photo",
              media: url,
              caption: index === 0 ? "🎨 *Muestrario de Plantillas*" : undefined,
              parse_mode: "Markdown"
            }));

            await axios.post(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
              chat_id,
              media: mediaGroup
            });
          }
        } else {
          await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id,
            text: "⚠️ Este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para activar la generación visual."
          });
        }
      }

      // Marcar como completado
      await snap.ref.update({ completado: true });
    } catch (error) {
      functions.logger.error("Error generando muestrario:", error);
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id,
          text: "Hubo un error generando el muestrario. Revisa los logs."
        }).catch(() => {});
      }
    }
  });
