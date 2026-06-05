"use strict";
/**
 * bannerbear.ts
 * ─────────────────────────────────────────────────────────────
 * Cliente HTTP para la API de Bannerbear.
 * Genera imágenes dinámicas inyectando textos, logos y colores
 * en templates vectoriales pre-diseñados.
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
exports.generarImagenSincronica = generarImagenSincronica;
exports.construirModificaciones = construirModificaciones;
const axios_1 = __importDefault(require("axios"));
const functions = __importStar(require("firebase-functions/v1"));
const BANNERBEAR_BASE_URL = "https://api.bannerbear.com/v2";
// ─── Cliente HTTP ─────────────────────────────────────────────
let _bbClient = null;
function getBannerbearClient() {
    if (_bbClient)
        return _bbClient;
    const apiKey = process.env.BANNERBEAR_API_KEY ||
        functions.config().bannerbear?.api_key;
    if (!apiKey) {
        throw new Error("[Bannerbear] API Key no encontrada. Verificar BANNERBEAR_API_KEY en secrets o .env");
    }
    _bbClient = axios_1.default.create({
        baseURL: BANNERBEAR_BASE_URL,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        timeout: 60000, // 60s — las imágenes síncronas pueden tardar
    });
    return _bbClient;
}
/**
 * Genera una imagen en Bannerbear de forma síncrona.
 * Bloquea la ejecución hasta que la imagen esté renderizada.
 *
 * @param request - Configuración de la imagen: template + modificaciones
 * @returns URL pública de la imagen generada
 */
async function generarImagenSincronica(request) {
    const client = getBannerbearClient();
    const payload = { ...request, synchronous: true };
    const response = await client.post("/images", payload);
    const data = response.data;
    if (data.status !== "completed" || !data.image_url) {
        throw new Error(`[Bannerbear] La imagen no se completó. Status: ${data.status}. UID: ${data.uid}`);
    }
    return data.image_url;
}
/**
 * Construye el array de modificaciones estándar para una marca.
 * Mapea los textos de capas gráficas, el logo y los colores de la marca.
 *
 * @param nombresCapa - Nombres de las capas de texto en el template
 * @param textos - Textos a inyectar en cada capa (mismo orden)
 * @param logoUrl - URL pública del logo de la marca
 * @param colorPrimario - Color primario HEX de la marca
 * @param colorSecundario - Color secundario HEX de la marca
 */
function construirModificaciones(nombresCapa, textos, logoUrl, colorPrimario, colorSecundario) {
    const mods = [];
    // Inyectar textos en las capas correspondientes
    nombresCapa.forEach((nombre, index) => {
        if (textos[index] !== undefined) {
            mods.push({ name: nombre, text: textos[index] });
        }
    });
    // Capas de marca (nombres de capa estándar definidos en los templates)
    mods.push({ name: "logo", image_url: logoUrl });
    mods.push({ name: "fondo_primario", background: colorPrimario });
    mods.push({ name: "fondo_secundario", background: colorSecundario });
    return mods;
}
//# sourceMappingURL=bannerbear.js.map