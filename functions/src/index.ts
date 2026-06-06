/**
 * index.ts
 * ─────────────────────────────────────────────────────────────
 * Punto de entrada de Firebase Cloud Functions.
 * Inicializa el SDK de Firebase Admin y exporta todas las funciones.
 *
 * IMPORTANTE: Firebase usa este archivo para descubrir qué funciones
 * desplegar. Solo las exportaciones de este archivo son visibles.
 * ─────────────────────────────────────────────────────────────
 */

import * as admin from "firebase-admin";

// Inicializar Firebase Admin SDK (una sola vez, en el cold start)
// En producción, las credenciales se infieren automáticamente del entorno.
// En local con el emulador, asegurarse de haber ejecutado:
//   firebase login && firebase use <project-id>
if (!admin.apps.length) {
  admin.initializeApp();
}

// ─── Exportar Cloud Functions ──────────────────────────────────

// Función 1: Webhook de ingesta de inputs espontáneos (Telegram)
export { ingestaEntradaEspontanea } from "./functions/ingestaEntradaEspontanea";

// Función 2a: Generación de grilla semanal (Scheduler — Lunes 8 AM)
export { generarGrillaSemanal } from "./functions/generarContenidoEstrategico";

// Función 2b: Procesamiento de inputs espontáneos (trigger /cola_ingesta)
export { generarContenidoEspontaneo } from "./functions/generarContenidoEspontaneo";

// Función 3: Publicador automático en Instagram (cada 15 min)
export { publicadorContenidoInstagram } from "./functions/publicadorContenidoInstagram";

// Función 4: Expansión de ideas y guardado en Google Docs (trigger /cola_docs)
export { generarDocumentosEspontaneos } from "./functions/generarDocumentosEspontaneos";
