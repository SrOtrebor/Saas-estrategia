/**
 * gemini.ts
 * ─────────────────────────────────────────────────────────────
 * Cliente singleton de Google Gemini 2.5 Flash.
 * Usa GEMINI_API_KEY del .env en local y Firebase Functions config en prod.
 * ─────────────────────────────────────────────────────────────
 */

import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("[Gemini] GEMINI_API_KEY no configurada en el entorno.");
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

/**
 * Genera contenido con Gemini 2.5 Flash y garantiza output JSON.
 */
export async function generarConGemini(prompt: string): Promise<string> {
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
