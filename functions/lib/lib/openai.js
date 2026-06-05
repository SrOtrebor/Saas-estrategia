"use strict";
/**
 * openai.ts
 * ─────────────────────────────────────────────────────────────
 * Cliente singleton de OpenAI.
 * Centraliza la inicialización para que todas las Cloud Functions
 * compartan la misma instancia (ahorra tiempo de cold start).
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
exports.getOpenAIClient = getOpenAIClient;
const openai_1 = __importDefault(require("openai"));
const functions = __importStar(require("firebase-functions/v1"));
let _openaiClient = null;
/**
 * Retorna el cliente de OpenAI inicializado de forma lazy.
 * Lee la API Key desde Firebase Secret Manager en producción,
 * o desde process.env para el emulador local.
 */
function getOpenAIClient() {
    if (_openaiClient)
        return _openaiClient;
    // En producción: definir el secret con `firebase functions:secrets:set OPENAI_API_KEY`
    // En local: agregar OPENAI_API_KEY en functions/.env
    const apiKey = process.env.OPENAI_API_KEY ||
        functions.config().openai?.api_key;
    if (!apiKey) {
        throw new Error("[OpenAI] API Key no encontrada. Verificar OPENAI_API_KEY en secrets o .env");
    }
    _openaiClient = new openai_1.default({ apiKey });
    return _openaiClient;
}
//# sourceMappingURL=openai.js.map