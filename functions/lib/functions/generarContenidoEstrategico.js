"use strict";
/**
 * generarContenidoEstrategico.ts
 * ─────────────────────────────────────────────────────────────
 * FUNCIÓN 2: Generador de Contenido Estratégico con IA
 *
 * Triggers:
 *   A) PubSub Scheduler — Todos los lunes a las 8:00 AM
 *   B) Firestore OnCreate — Al aparecer un nuevo documento en /cola_ingesta
 *
 * Flujo:
 *   1. Leer config de la marca desde Firestore (/marcas/{id_marca})
 *   2. Construir prompt dinámico con variables de la marca
 *   3. Llamar a Gemini 2.5 Flash con output JSON estructurado
 *   4. Si formato requiere gráfico → generar imagen con Sharp+SVG (GRATIS)
 *   5. Insertar resultado en /planificador_contenido con estado PENDIENTE
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
exports.generarGrillaSemanal = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const gemini_1 = require("../lib/gemini");
const imageGenerator_1 = require("../lib/imageGenerator");
const googleSheets_1 = require("../lib/googleSheets");
// ═══════════════════════════════════════════════════════════════
// TRIGGER A: Scheduler — Lunes 8:00 AM (zona UTC-3 = 11:00 UTC)
// ═══════════════════════════════════════════════════════════════
exports.generarGrillaSemanal = functions
    .runWith({
    timeoutSeconds: 540, // 9 minutos máximo
    memory: "512MB",
})
    .pubsub.schedule("0 11 * * 1") // Cada lunes 11:00 UTC (08:00 Argentina)
    .timeZone("America/Argentina/Buenos_Aires")
    .onRun(async (_context) => {
    functions.logger.info("[generarGrillaSemanal] Iniciando generación semanal...");
    const db = admin.firestore();
    // Obtener todas las marcas activas
    const marcasSnap = await db.collection("marcas").get();
    if (marcasSnap.empty) {
        functions.logger.warn("[generarGrillaSemanal] No se encontraron marcas en Firestore.");
        return;
    }
    // Generar contenido para cada marca en paralelo
    const promesas = marcasSnap.docs.map((doc) => {
        const marca = doc.data();
        return generarYGuardarContenido(marca, "cron_semanal").catch((err) => {
            functions.logger.error(`[generarGrillaSemanal] Error procesando marca ${marca.id_marca}:`, err);
        });
    });
    await Promise.all(promesas);
    functions.logger.info("[generarGrillaSemanal] Grilla semanal generada para todas las marcas.");
});
// (La función generarContenidoEspontaneo fue movida a su propio archivo)
// ═══════════════════════════════════════════════════════════════
// FUNCIÓN CORE: generarYGuardarContenido
// Esta función contiene toda la lógica de negocio.
// ═══════════════════════════════════════════════════════════════
/**
 * Orquesta la generación completa de un post:
 * lee la marca → construye prompt → llama IA → genera gráfico → guarda en Firestore.
 */
async function generarYGuardarContenido(marca, origen, contextoAdicional) {
    const db = admin.firestore();
    // ─── PASO 1: Construir el prompt dinámico ──────────────────
    const prompt = construirPrompt(marca, contextoAdicional);
    functions.logger.info(`[generarContenido] Prompt construido para: ${marca.nombre_comercial}`);
    // ─── PASO 2: Llamar a la IA con output JSON estructurado ───
    const iaResponse = await llamarIA(prompt, marca.nombre_comercial);
    functions.logger.info(`[generarContenido] Respuesta de IA recibida. Formato: ${iaResponse.formato_recomendado}`);
    // ─── PASO 3: Generar gráficos con Sharp+SVG (GRATIS) ───────
    const assetsLinks = [];
    if (iaResponse.formato_recomendado !== "REELS" &&
        iaResponse.textos_capas_graficas &&
        iaResponse.textos_capas_graficas.length > 0) {
        functions.logger.info(`[generarContenido] Generando imágenes con Sharp+SVG para ${marca.nombre_comercial}`);
        try {
            // Usar el ID del documento como ID del post (lo asignamos antes de guardar)
            const postIdTemp = db.collection("planificador_contenido").doc().id;
            const urls = await (0, imageGenerator_1.generarCarrusel)(iaResponse.textos_capas_graficas, marca.identidad_visual, marca.nombre_comercial, marca.id_marca, postIdTemp);
            assetsLinks.push(...urls);
            functions.logger.info(`[generarContenido] ${urls.length} imágenes generadas y subidas a Storage.`);
        }
        catch (err) {
            functions.logger.error("[generarContenido] Error al generar imágenes:", err);
            // Continuar sin gráfico; el operador lo notará en el panel
        }
    }
    // ─── PASO 4: Parsear fecha sugerida por la IA ──────────────
    let fechaSugerida;
    try {
        fechaSugerida = firestore_1.Timestamp.fromDate(new Date(iaResponse.fecha_hora_sugerida_iso));
    }
    catch {
        // Si la IA retorna una fecha inválida, usar mañana a las 9 AM por defecto
        const manana = new Date();
        manana.setDate(manana.getDate() + 1);
        manana.setHours(9, 0, 0, 0);
        fechaSugerida = firestore_1.Timestamp.fromDate(manana);
    }
    // ─── PASO 5: Construir y guardar el documento en Firestore ─
    const ahora = firestore_1.Timestamp.now();
    const nuevoPost = {
        id_marca: marca.id_marca,
        origen,
        fecha_hora_sugerida: fechaSugerida,
        formato: iaResponse.formato_recomendado,
        estado: "PENDIENTE",
        contexto_input: contextoAdicional,
        contenido_generado: {
            titulo_gancho: iaResponse.titulo_gancho,
            copy_instagram: iaResponse.copy_instagram,
            guion_reel_teleprompter: iaResponse.guion_reel_teleprompter,
            textos_capas_graficas: iaResponse.textos_capas_graficas,
        },
        assets_links: assetsLinks,
        created_at: ahora,
        updated_at: ahora,
    };
    const docRef = await db.collection("planificador_contenido").add(nuevoPost);
    functions.logger.info(`[generarContenido] Post guardado en Firestore. ID: ${docRef.id} | Marca: ${marca.nombre_comercial}`);
    // ─── PASO 6: Registrar en Google Sheets ──────────────────────
    await (0, googleSheets_1.agregarFilaPost)(docRef.id, marca.id_marca, iaResponse.titulo_gancho, iaResponse.copy_instagram, iaResponse.hashtags || "", assetsLinks, "PENDIENTE");
}
// ═══════════════════════════════════════════════════════════════
// HELPER: construirPrompt
// El prompt inyecta las variables del documento de la marca.
// Aquí es donde la IA "aprende" a ser estratega de cada negocio.
// ═══════════════════════════════════════════════════════════════
/**
 * Construye el prompt dinámico para la IA inyectando las variables de la marca.
 * Este es el "cerebro" del sistema: al cambiar el documento de marca en Firestore,
 * toda la lógica de comunicación de la IA muta automáticamente.
 */
function construirPrompt(marca, contextoAdicional) {
    const { datos_negocio, comunicacion } = marca;
    const pilaresFormateados = comunicacion.pilares_contenido
        .map((p, i) => `  ${i + 1}. ${p}`)
        .join("\n");
    const cuentasReferencia = comunicacion.cuentas_referencia.join(", ");
    const seccionContexto = contextoAdicional
        ? `
## CONTEXTO URGENTE / INPUT DEL CLIENTE
El cliente envió el siguiente input para que lo desarrolles en un post:
"${contextoAdicional}"

Prioriza este contexto. El post debe GIRAR en torno a esta información.
`
        : `
## MODO PLANIFICACIÓN SEMANAL
No hay input urgente. Elige el pilar de contenido más estratégico para esta semana
considerando variedad y máximo impacto en el algoritmo de Instagram.
`;
    return `
Eres un estratega de contenido de Instagram de élite especializado en el rubro "${datos_negocio.rubro}".
Tu trabajo es crear contenido que genere conversiones reales, no solo likes.

## DATOS DEL NEGOCIO
- **Nombre comercial:** ${marca.nombre_comercial}
- **Rubro:** ${datos_negocio.rubro}
- **Público objetivo:** ${datos_negocio.publico_objetivo}
- **Propuesta de valor única:** ${datos_negocio.propuesta_valor}

## IDENTIDAD DE COMUNICACIÓN
- **Tono de voz y directivas de copywriting:**
  ${comunicacion.tono_de_voz}

- **Pilares de contenido disponibles (elige el más estratégico):**
${pilaresFormateados}

- **Cuentas de referencia para inspiración de formato y ángulo:**
  ${cuentasReferencia}

${seccionContexto}

## INSTRUCCIONES DE OUTPUT
Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown.
El JSON debe seguir EXACTAMENTE este esquema:

{
  "titulo_gancho": "string — máximo 10 palabras. Debe generar curiosidad o urgencia.",
  "copy_instagram": "string — caption completo listo para publicar. Incluye emojis estratégicos, saltos de línea cada 3-4 líneas, y al final 15-20 hashtags relevantes en castellano e inglés.",
  "guion_reel_teleprompter": "string o null — Solo si recomiendas formato REELS. Escribe un guión dividido en: [INTRO 5s] [DESARROLLO 30s] [CTA 10s]. Frases cortas para teleprompter.",
  "textos_capas_graficas": ["array de strings"] — Solo si recomiendas CARRUSEL, IMAGEN o HISTORIA. Cada string es el texto de una diapositiva/capa. Máximo 10 palabras por capa.",
  "hashtags": "string — Los hashtags separados por espacio (ya incluidos en copy_instagram, aquí en bruto).",
  "fecha_hora_sugerida_iso": "string — Fecha y hora de publicación recomendada en ISO 8601 (próximos 7 días, en horario pico: 12:00 o 20:00 Argentina).",
  "formato_recomendado": "REELS | CARRUSEL | IMAGEN | HISTORIA"
}
`.trim();
}
// ═══════════════════════════════════════════════════════════════
// HELPER: llamarIA
// Llama a OpenAI GPT-4o y garantiza el output en formato JSON.
// ═══════════════════════════════════════════════════════════════
/**
 * Llama a Google Gemini 2.5 Flash (gratuito) con JSON mode.
 */
async function llamarIA(prompt, nombreMarca) {
    const rawContent = await (0, gemini_1.generarConGemini)(prompt);
    if (!rawContent) {
        throw new Error(`[Gemini] Respuesta vacía para la marca: ${nombreMarca}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(rawContent);
    }
    catch {
        throw new Error(`[Gemini] JSON inválido para ${nombreMarca}. Raw: ${rawContent.substring(0, 200)}`);
    }
    if (!parsed.titulo_gancho || !parsed.copy_instagram || !parsed.formato_recomendado) {
        throw new Error(`[Gemini] Respuesta incompleta para ${nombreMarca}. Faltan campos obligatorios.`);
    }
    return parsed;
}
//# sourceMappingURL=generarContenidoEstrategico.js.map