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
exports.procesarGeneracionMenu = exports.procesarMenuSemanal = exports.generarGrillaSemanal = void 0;
exports.generarYGuardarContenido = generarYGuardarContenido;
exports.proponerIdeasSemanales = proponerIdeasSemanales;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const gemini_1 = require("../lib/gemini");
const imageGenerator_1 = require("../lib/imageGenerator");
const googleSheets_1 = require("../lib/googleSheets");
const googleDocs_1 = require("../lib/googleDocs");
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
    // Proponer ideas (Menú) para cada marca en paralelo
    const promesas = marcasSnap.docs.map((doc) => {
        const marca = doc.data();
        return proponerIdeasSemanales(marca).catch((err) => {
            functions.logger.error(`[generarGrillaSemanal] Error proponiendo ideas para marca ${marca.id_marca}:`, err);
        });
    });
    await Promise.all(promesas);
    functions.logger.info("[generarGrillaSemanal] Menú de ideas enviado para todas las marcas.");
});
// ═══════════════════════════════════════════════════════════════
// TRIGGERS DE COLAS (Para ejecución en segundo plano segura)
// ═══════════════════════════════════════════════════════════════
exports.procesarMenuSemanal = functions.firestore
    .document("cola_menu_semanal/{docId}")
    .onCreate(async (snap, context) => {
    const data = snap.data();
    const db = admin.firestore();
    const marcaSnap = await db.collection("marcas").doc(data.id_marca).get();
    if (marcaSnap.exists) {
        await proponerIdeasSemanales(marcaSnap.data());
    }
    // Borrar el doc de la cola para mantener limpio
    await snap.ref.delete();
});
exports.procesarGeneracionMenu = functions.runWith({ memory: "1GB", timeoutSeconds: 300 }).firestore
    .document("cola_generacion_menu/{docId}")
    .onCreate(async (snap, context) => {
    const data = snap.data();
    const db = admin.firestore();
    const idBoceto = data.id_boceto;
    const bocetoDoc = await db.collection("banco_ideas").doc(idBoceto).get();
    if (!bocetoDoc.exists)
        return;
    const boceto = bocetoDoc.data();
    const marcaSnap = await db.collection("marcas").doc(boceto?.id_marca).get();
    if (marcaSnap.exists) {
        const contextoAdicional = `Por favor, desarrollá el contenido completo basándote estrictamente en esta idea aprobada por el usuario:\nTítulo: ${boceto?.titulo_corto}\nFormato esperado: ${boceto?.formato}\nResumen de la idea: ${boceto?.resumen}\n\nIMPORTANTE: El output debe respetar el formato ${boceto?.formato}.`;
        const result = await generarYGuardarContenido(marcaSnap.data(), "input_espontaneo", contextoAdicional);
        const chatId = data.chat_id;
        if (chatId) {
            const axios = require("axios");
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken) {
                try {
                    const msgText = result.sheetsLink
                        ? `✅ *¡Contenido generado con éxito y guardado en tu grilla!*\n\n📊 [Abrir Excel de Planificación](${result.sheetsLink})`
                        : `✅ *¡Contenido generado con éxito!*\n\n❌ _No se pudo acceder a Google Sheets. Verificá los permisos del Drive._`;
                    if (result.links.length > 0) {
                        const media = result.links.map((url, i) => ({
                            type: "photo",
                            media: url,
                            caption: i === 0 ? `🎨 *${boceto?.titulo_corto}*` : undefined,
                            parse_mode: i === 0 ? "Markdown" : undefined,
                        }));
                        await axios.post(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, { chat_id: chatId, media });
                        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            chat_id: chatId,
                            text: msgText,
                            parse_mode: "Markdown",
                        });
                    }
                    else {
                        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            chat_id: chatId,
                            text: msgText,
                            parse_mode: "Markdown",
                        });
                    }
                }
                catch (err) {
                    functions.logger.error("Error enviando mensaje a Telegram", err?.response?.data || err);
                }
            }
        }
    }
    await snap.ref.delete();
});
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
    const esFormatoGuion = iaResponse.formato_recomendado === "REELS" || iaResponse.formato_recomendado === "REEL_TELEPROMPTER";
    if (esFormatoGuion) {
        functions.logger.info(`[generarContenido] Generando Google Doc para ${marca.nombre_comercial}`);
        try {
            const docUrl = await (0, googleDocs_1.agregarGuionADocumentoExistente)(marca.google_doc_id || "", iaResponse.titulo_gancho, `${iaResponse.guion_reel_teleprompter ? `*** GUION TELEPROMPTER ***\n${iaResponse.guion_reel_teleprompter}\n\n*** COPY INSTAGRAM ***\n` : ''}${iaResponse.copy_instagram}`);
            assetsLinks.push(docUrl);
            functions.logger.info(`[generarContenido] Google Doc creado: ${docUrl}`);
        }
        catch (err) {
            functions.logger.error("[generarContenido] Error al crear el Google Doc:", err);
        }
    }
    else if (iaResponse.textos_capas_graficas && iaResponse.textos_capas_graficas.length > 0) {
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
    try {
        const fila = {
            dia: iaResponse.dia_semana || "Lunes",
            formato: iaResponse.formato_recomendado,
            copy: iaResponse.copy_instagram,
            hashtags: iaResponse.hashtags || "",
            tipoEstrategia: iaResponse.tipo_estrategia || "Contenido de Valor",
            linkContenido: assetsLinks.length > 0 ? assetsLinks.join(", ") : "PENDIENTE DE ARCHIVOS",
            estado: "Pendiente"
        };
        const sheetsLink = await (0, googleSheets_1.actualizarPlanillaExistente)(marca.google_sheet_id || "PENDIENTE", [fila]);
        return { postId: docRef.id, links: assetsLinks, sheetsLink };
    }
    catch (error) {
        functions.logger.error("[generarContenido] Error escribiendo en Google Sheets", error);
    }
    return { postId: docRef.id, links: assetsLinks };
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
  "textos_capas_graficas": [
    "<h2>ETAPA 1 - EL PROBLEMA</h2><h1>TÍTULO DE IMPACTO GIGANTE</h1><p>Párrafo profundo que explique el dolor del cliente y cómo lo vive en el día a día.</p><div class='highlight'>Remate: Por qué esto es una trampa.</div>",
    "<h2>DESARROLLO</h2><h1>SÍNTOMAS DEL CAOS</h1><p>Cómo operás hoy:</p><ul><li>Síntoma 1 con mucho detalle.</li><li>Síntoma 2 con intención.</li></ul><div class='highlight'>Acá es donde el 90% se estanca.</div>"
  ], // (Solo si recomiendas CARRUSEL, IMAGEN o HISTORIA. Máximo 6 elementos en el array)
  "hashtags": "string — Los hashtags separados por espacio (ya incluidos en copy_instagram, aquí en bruto).",
  "fecha_hora_sugerida_iso": "string — Fecha y hora de publicación recomendada en ISO 8601 (próximos 7 días, en horario pico: 12:00 o 20:00 Argentina).",
  "formato_recomendado": "REELS | CARRUSEL | IMAGEN | HISTORIA",
  "dia_semana": "string — Lunes, Martes, Miércoles, Jueves o Viernes",
  "tipo_estrategia": "string — Educativo, Venta, Entretenimiento o Inspiración"
}

INSTRUCCIONES PARA CAPAS GRÁFICAS (textos_capas_graficas):
Debes generar un MÁXIMO DE 6 DIAPOSITIVAS por carrusel. Usa SÓLO etiquetas HTML para la estructura interna de cada string del array:
- <h2> para la 'píldora' superior (categoría o etapa).
- <h1> para el gancho o título principal (muy impactante y controversial).
- <p> para párrafos descriptivos profundos (máximo 2 a 3 oraciones por placa, aprox 30-40 palabras).
- <ul> y <li> para viñetas (máximo 3 puntos).
- <div class='highlight'> para recuadros de remate abajo.
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
// ═══════════════════════════════════════════════════════════════
// NUEVO FLUJO: IDEACIÓN (Paso 1 del flujo de 2 pasos)
// ═══════════════════════════════════════════════════════════════
async function proponerIdeasSemanales(marca) {
    const db = admin.firestore();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = marca.credenciales_redes.telegram_chat_id;
    if (!botToken || !chatId) {
        functions.logger.warn(`[proponerIdeas] Faltan credenciales de Telegram para ${marca.nombre_comercial}`);
        return;
    }
    functions.logger.info(`[proponerIdeas] Generando menú de ideas para: ${marca.nombre_comercial}`);
    const promptIdeacion = `
Sos el ESTRATEGA DE CONTENIDO principal para la marca ${marca.nombre_comercial} (Rubro: ${marca.datos_negocio.rubro}).
Tu objetivo es armar un "Menú de Ideas Semanal" basado en TENDENCIAS ACTUALES.

IDENTIDAD DE MARCA:
- Público: ${marca.datos_negocio.publico_objetivo}
- Tono: ${marca.comunicacion.tono_de_voz}
- Pilares: ${marca.comunicacion.pilares_contenido.join(", ")}

TAREA:
1. Investigá mentalmente cuáles son las tendencias, noticias o dolores más actuales de esta semana para este nicho.
2. Generá exactamente 5 ideas de contenido (mezclá CARRUSEL y REEL_TELEPROMPTER).
3. Devolvé un JSON estricto con la siguiente estructura (NADA MÁS QUE EL JSON):

{
  "ideas": [
    {
      "titulo_corto": "Título llamativo (máx 5 palabras)",
      "formato": "CARRUSEL o REEL_TELEPROMPTER",
      "resumen": "Descripción de 2 líneas de qué va a tratar el post y por qué va a funcionar."
    }
  ]
}`;
    try {
        const aiResponse = await (0, gemini_1.generarConGemini)(promptIdeacion);
        let resultParsed;
        try {
            const cleanJson = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();
            resultParsed = JSON.parse(cleanJson);
        }
        catch (e) {
            functions.logger.error("[proponerIdeas] Error parseando JSON de Gemini", e);
            return;
        }
        const ideas = resultParsed.ideas || [];
        if (ideas.length === 0)
            return;
        let mensajeTelegram = `📅 *MENÚ SEMANAL DE IDEAS* 📅\n_Investigué las tendencias actuales y estas son mis 5 propuestas para ${marca.nombre_comercial}:_\n\n`;
        const inline_keyboard = [];
        for (let i = 0; i < ideas.length; i++) {
            const idea = ideas[i];
            const ideaRef = await db.collection("banco_ideas").add({
                id_marca: marca.id_marca,
                titulo_corto: idea.titulo_corto,
                formato: idea.formato,
                resumen: idea.resumen,
                estado: "BOCETO",
                created_at: firestore_1.Timestamp.now()
            });
            mensajeTelegram += `*${i + 1}. ${idea.titulo_corto}* [${idea.formato}]\n_${idea.resumen}_\n\n`;
            inline_keyboard.push([{
                    text: `⚡ Generar Idea ${i + 1}`,
                    callback_data: `generar_post_${ideaRef.id}`
                }]);
        }
        mensajeTelegram += `👇 *Tocá los botones de las ideas que quieras que desarrolle por completo:*`;
        const axios = require("axios");
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: mensajeTelegram,
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: inline_keyboard
            }
        });
        functions.logger.info(`[proponerIdeas] Menú enviado a Telegram para ${marca.nombre_comercial}`);
    }
    catch (error) {
        functions.logger.error(`[proponerIdeas] Error: ${error.message}`);
    }
}
//# sourceMappingURL=generarContenidoEstrategico.js.map