"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicadorContenidoInstagram = exports.generarContenidoEspontaneo = exports.generarGrillaSemanal = exports.ingestaEntradaEspontanea = void 0;
const admin = __importStar(require("firebase-admin"));
// Inicializar Firebase Admin SDK (una sola vez, en el cold start)
// En producción, las credenciales se infieren automáticamente del entorno.
// En local con el emulador, asegurarse de haber ejecutado:
//   firebase login && firebase use <project-id>
if (!admin.apps.length) {
    admin.initializeApp();
}
// ─── Exportar Cloud Functions ──────────────────────────────────
// Función 1: Webhook de ingesta de inputs espontáneos (Telegram)
var ingestaEntradaEspontanea_1 = require("./functions/ingestaEntradaEspontanea");
Object.defineProperty(exports, "ingestaEntradaEspontanea", { enumerable: true, get: function () { return ingestaEntradaEspontanea_1.ingestaEntradaEspontanea; } });
// Función 2a: Generación de grilla semanal (Scheduler — Lunes 8 AM)
var generarContenidoEstrategico_1 = require("./functions/generarContenidoEstrategico");
Object.defineProperty(exports, "generarGrillaSemanal", { enumerable: true, get: function () { return generarContenidoEstrategico_1.generarGrillaSemanal; } });
// Función 2b: Procesamiento de inputs espontáneos (trigger /cola_ingesta)
var generarContenidoEspontaneo_1 = require("./functions/generarContenidoEspontaneo");
Object.defineProperty(exports, "generarContenidoEspontaneo", { enumerable: true, get: function () { return generarContenidoEspontaneo_1.generarContenidoEspontaneo; } });
// Función 3: Publicador automático en Instagram (cada 15 min)
var publicadorContenidoInstagram_1 = require("./functions/publicadorContenidoInstagram");
Object.defineProperty(exports, "publicadorContenidoInstagram", { enumerable: true, get: function () { return publicadorContenidoInstagram_1.publicadorContenidoInstagram; } });
//# sourceMappingURL=index.js.map