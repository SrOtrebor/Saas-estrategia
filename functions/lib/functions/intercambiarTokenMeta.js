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
exports.intercambiarTokenMeta = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
// ═══════════════════════════════════════════════════════════════
// CLOUD FUNCTION: intercambiarTokenMeta
// Endpoint HTTPS (CORS enabled) para cambiar token corto a largo
// ═══════════════════════════════════════════════════════════════
exports.intercambiarTokenMeta = functions.https.onRequest(async (req, res) => {
    // Manejo básico de CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    try {
        const { shortLivedToken, idMarca } = req.body;
        if (!shortLivedToken || !idMarca) {
            res.status(400).send("Faltan parámetros: shortLivedToken o idMarca");
            return;
        }
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        if (!appId || !appSecret) {
            functions.logger.error("Faltan variables de entorno META_APP_ID o META_APP_SECRET");
            res.status(500).send("Error de configuración del servidor");
            return;
        }
        // 1. Intercambiar por Long-Lived Token
        const url = `https://graph.facebook.com/v20.0/oauth/access_token`;
        const response = await axios_1.default.get(url, {
            params: {
                grant_type: "fb_exchange_token",
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: shortLivedToken,
            },
        });
        const longLivedToken = response.data.access_token;
        // 2. Guardar en Firestore
        const db = admin.firestore();
        const marcaRef = db.collection("marcas").doc(idMarca);
        // Solo actualizar el token y marcar como completado (si no lo estaba)
        await marcaRef.set({
            token_meta: longLivedToken,
            onboarding_completado: true,
            updated_at: admin.firestore.Timestamp.now()
        }, { merge: true });
        functions.logger.info(`[OAuth] Token largo guardado para la marca: ${idMarca}`);
        res.status(200).json({ success: true, message: "Token intercambiado y guardado correctamente." });
    }
    catch (error) {
        functions.logger.error("[OAuth] Error al intercambiar token:", error.response?.data || error.message);
        res.status(500).json({ error: "No se pudo intercambiar el token." });
    }
});
//# sourceMappingURL=intercambiarTokenMeta.js.map