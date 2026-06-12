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
exports.procesarTestPlantillas = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const imageGenerator_1 = require("../lib/imageGenerator");
exports.procesarTestPlantillas = functions
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
    const marca = marcaDoc.data();
    const identidad = marca.identidad_visual;
    try {
        // 1. Generar imágenes
        const urls = await (0, imageGenerator_1.generarMuestrarioPlantillas)(identidad, id_marca);
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
                    await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
                        chat_id,
                        media: mediaGroup
                    });
                }
            }
            else {
                await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id,
                    text: "⚠️ Este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para activar la generación visual."
                });
            }
        }
        // Marcar como completado
        await snap.ref.update({ completado: true });
    }
    catch (error) {
        functions.logger.error("Error generando muestrario:", error);
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
            await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                chat_id,
                text: "Hubo un error generando el muestrario. Revisa los logs."
            }).catch(() => { });
        }
    }
});
//# sourceMappingURL=testPlantillas.js.map