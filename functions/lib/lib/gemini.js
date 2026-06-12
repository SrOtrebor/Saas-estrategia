"use strict";
/**
 * gemini.ts
 * ─────────────────────────────────────────────────────────────
 * Cliente singleton de Google Gemini 2.5 Flash.
 * Usa GEMINI_API_KEY del .env en local y Firebase Functions config en prod.
 * ─────────────────────────────────────────────────────────────
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGeminiClient = getGeminiClient;
exports.generarConGemini = generarConGemini;
const genai_1 = require("@google/genai");
const envValidator_1 = require("./envValidator");
let _client = null;
function getGeminiClient() {
    if (_client)
        return _client;
    const apiKey = (0, envValidator_1.requireEnv)("GEMINI_API_KEY");
    if (!apiKey) {
        throw new Error("[Gemini] GEMINI_API_KEY no configurada en el entorno.");
    }
    _client = new genai_1.GoogleGenAI({ apiKey });
    return _client;
}
/**
 * Genera contenido con Gemini 2.5 Flash y garantiza output JSON.
 */
async function generarConGemini(prompt) {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            temperature: 0.85,
        },
    });
    return response.text ?? "";
}
//# sourceMappingURL=gemini.js.map