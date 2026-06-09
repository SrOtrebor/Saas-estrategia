"use strict";
/**
 * publicadorContenidoInstagram.ts
 * ─────────────────────────────────────────────────────────────
 * FUNCIÓN 3: Publicador Automático en Instagram
 *
 * Trigger: PubSub Scheduler — Cada 15 minutos.
 *
 * Flujo:
 *   1. Consultar posts APROBADOS con fecha_hora_sugerida <= ahora
 *   2. Para cada post:
 *      - REELS/IMAGEN: Publicar vía Meta Graph API (/media + /media_publish)
 *      - CARRUSEL: Crear contenedor multi-media y publicar
 *      - HISTORIA: Notificar al usuario por Telegram (Meta no permite automatizar)
 *   3. Cambiar estado a PUBLICADO (o manejar errores)
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
exports.publicadorContenidoInstagram = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const axios_1 = __importDefault(require("axios"));
const META_GRAPH_BASE = "https://graph.facebook.com/v20.0";
// ═══════════════════════════════════════════════════════════════
// CLOUD FUNCTION: publicadorContenidoInstagram (Scheduler)
// ═══════════════════════════════════════════════════════════════
exports.publicadorContenidoInstagram = functions
    .runWith({
    timeoutSeconds: 540,
    memory: "512MB",
})
    .pubsub.schedule("every 15 minutes")
    .onRun(async (_context) => {
    functions.logger.info("[publicador] Iniciando ciclo de publicación...");
    const db = admin.firestore();
    const ahora = firestore_1.Timestamp.now();
    // ─── Consultar posts listos para publicar ─────────────────
    const postsSnap = await db
        .collection("planificador_contenido")
        .where("estado", "==", "APROBADO")
        .where("fecha_hora_sugerida", "<=", ahora)
        .orderBy("fecha_hora_sugerida", "asc")
        .limit(10) // Procesar máximo 10 por ciclo para evitar timeouts
        .get();
    if (postsSnap.empty) {
        functions.logger.info("[publicador] No hay posts aprobados listos para publicar.");
        return;
    }
    functions.logger.info(`[publicador] ${postsSnap.size} post(s) listos para publicar.`);
    // Procesar cada post de forma secuencial (evita rate limits de Meta)
    for (const doc of postsSnap.docs) {
        const post = { ...doc.data(), id_post: doc.id };
        // Bloqueo optimista: marcar como PROCESANDO antes de publicar
        await doc.ref.update({ estado: "PROCESANDO", updated_at: firestore_1.Timestamp.now() });
        try {
            await procesarPost(post, doc.ref);
        }
        catch (error) {
            functions.logger.error(`[publicador] Error al publicar post ${post.id_post}:`, error);
            // Revertir a APROBADO para reintentar en el próximo ciclo
            await doc.ref.update({ estado: "APROBADO", updated_at: firestore_1.Timestamp.now() });
        }
    }
    functions.logger.info("[publicador] Ciclo completado.");
});
// ═══════════════════════════════════════════════════════════════
// PROCESAMIENTO POR POST
// ═══════════════════════════════════════════════════════════════
async function procesarPost(post, docRef) {
    const db = admin.firestore();
    // Obtener configuración de la marca (incluyendo token de Meta y Telegram)
    const marcaDoc = await db.collection("marcas").doc(post.id_marca).get();
    if (!marcaDoc.exists) {
        throw new Error(`Marca no encontrada: ${post.id_marca}`);
    }
    const marca = marcaDoc.data();
    // Si el cliente no tiene publicación automática, enviamos el material por Telegram
    if (marca.publicacion_automatica === false) {
        functions.logger.info(`[publicador] Publicación automática desactivada para ${marca.nombre_comercial}. Enviando a Telegram.`);
        await notificarPublicacionManualTelegram(post, marca);
        await docRef.update({ estado: "PUBLICADO", updated_at: firestore_1.Timestamp.now() });
        return;
    }
    // Obtener el access token de Meta desde la configuración de la marca o env como fallback
    const metaToken = marca.token_meta || process.env.META_LONG_LIVED_TOKEN;
    if (!metaToken) {
        throw new Error("[publicador] Token de Meta no configurado para esta marca.");
    }
    functions.logger.info(`[publicador] Publicando post ${post.id_post} (${post.formato}) para ${marca.nombre_comercial}`);
    switch (post.formato) {
        case "IMAGEN":
            await publicarImagen(post, marca, metaToken, docRef);
            break;
        case "REELS":
            await publicarReel(post, marca, metaToken, docRef);
            break;
        case "CARRUSEL":
            await publicarCarrusel(post, marca, metaToken, docRef);
            break;
        case "HISTORIA":
            // Meta no permite publicar Historias de forma automática
            // → Notificar al usuario por Telegram para que la suba manualmente
            await notificarHistoriaTelegram(post, marca);
            await docRef.update({
                estado: "PUBLICADO", // Marcar como publicado (manualmente)
                updated_at: firestore_1.Timestamp.now(),
            });
            break;
        default:
            throw new Error(`Formato no soportado: ${post.formato}`);
    }
}
// ═══════════════════════════════════════════════════════════════
// PUBLICADORES POR FORMATO
// ═══════════════════════════════════════════════════════════════
/**
 * Publica una imagen única en el feed de Instagram.
 * API: /media (crear contenedor) → /media_publish (publicar)
 */
async function publicarImagen(post, marca, token, docRef) {
    const igBusinessId = marca.credenciales_redes.instagram_business_id;
    const imageUrl = post.assets_links[0];
    if (!imageUrl)
        throw new Error("No hay asset_link para publicar la imagen.");
    // Paso 1: Crear contenedor de media
    const mediaRes = await axios_1.default.post(`${META_GRAPH_BASE}/${igBusinessId}/media`, null, {
        params: {
            image_url: imageUrl,
            caption: post.contenido_generado.copy_instagram,
            access_token: token,
        },
    });
    const creationId = mediaRes.data.id;
    functions.logger.info(`[publicador] Contenedor creado. ID: ${creationId}`);
    // Pequeña espera para que Meta procese el contenedor
    await sleep(3000);
    // Paso 2: Publicar el contenedor
    const publishRes = await axios_1.default.post(`${META_GRAPH_BASE}/${igBusinessId}/media_publish`, null, {
        params: {
            creation_id: creationId,
            access_token: token,
        },
    });
    const mediaId = publishRes.data.id;
    functions.logger.info(`[publicador] Imagen publicada. Media ID: ${mediaId}`);
    await docRef.update({
        estado: "PUBLICADO",
        instagram_media_id: mediaId,
        updated_at: firestore_1.Timestamp.now(),
    });
}
/**
 * Publica un Reel en Instagram.
 * El video debe estar alojado en una URL pública (Firebase Storage).
 */
async function publicarReel(post, marca, token, docRef) {
    const igBusinessId = marca.credenciales_redes.instagram_business_id;
    const videoUrl = post.assets_links[0];
    if (!videoUrl)
        throw new Error("No hay asset_link para publicar el Reel.");
    // Paso 1: Crear contenedor de Reel
    const mediaRes = await axios_1.default.post(`${META_GRAPH_BASE}/${igBusinessId}/media`, null, {
        params: {
            media_type: "REELS",
            video_url: videoUrl,
            caption: post.contenido_generado.copy_instagram,
            access_token: token,
        },
    });
    const creationId = mediaRes.data.id;
    functions.logger.info(`[publicador] Contenedor de Reel creado. ID: ${creationId}`);
    // Los videos requieren tiempo de procesamiento en los servidores de Meta
    // Esperar hasta que el contenedor esté listo (polling simple)
    await esperarProcesamientoMeta(igBusinessId, creationId, token);
    // Paso 2: Publicar
    const publishRes = await axios_1.default.post(`${META_GRAPH_BASE}/${igBusinessId}/media_publish`, null, {
        params: {
            creation_id: creationId,
            access_token: token,
        },
    });
    const mediaId = publishRes.data.id;
    functions.logger.info(`[publicador] Reel publicado. Media ID: ${mediaId}`);
    await docRef.update({
        estado: "PUBLICADO",
        instagram_media_id: mediaId,
        updated_at: firestore_1.Timestamp.now(),
    });
}
/**
 * Publica un carrusel de imágenes en Instagram.
 * Requiere crear contenedores individuales por imagen + contenedor principal.
 */
async function publicarCarrusel(post, marca, token, docRef) {
    const igBusinessId = marca.credenciales_redes.instagram_business_id;
    if (!post.assets_links.length) {
        throw new Error("No hay assets_links para publicar el carrusel.");
    }
    // Paso 1: Crear contenedores individuales para cada imagen del carrusel
    const childrenIds = [];
    for (const imageUrl of post.assets_links) {
        const childRes = await axios_1.default.post(`${META_GRAPH_BASE}/${igBusinessId}/media`, null, {
            params: {
                image_url: imageUrl,
                is_carousel_item: true,
                access_token: token,
            },
        });
        childrenIds.push(childRes.data.id);
        await sleep(500); // Rate limiting conservador
    }
    functions.logger.info(`[publicador] ${childrenIds.length} items de carrusel creados.`);
    // Paso 2: Crear el contenedor principal del carrusel
    const carouselRes = await axios_1.default.post(`${META_GRAPH_BASE}/${igBusinessId}/media`, null, {
        params: {
            media_type: "CAROUSEL",
            children: childrenIds.join(","),
            caption: post.contenido_generado.copy_instagram,
            access_token: token,
        },
    });
    const creationId = carouselRes.data.id;
    await sleep(3000);
    // Paso 3: Publicar el carrusel
    const publishRes = await axios_1.default.post(`${META_GRAPH_BASE}/${igBusinessId}/media_publish`, null, {
        params: {
            creation_id: creationId,
            access_token: token,
        },
    });
    const mediaId = publishRes.data.id;
    functions.logger.info(`[publicador] Carrusel publicado. Media ID: ${mediaId}`);
    await docRef.update({
        estado: "PUBLICADO",
        instagram_media_id: mediaId,
        updated_at: firestore_1.Timestamp.now(),
    });
}
/**
 * Notifica al operador por Telegram para que publique la Historia manualmente.
 * Incluye el copy y el link al asset de forma estructurada.
 */
async function notificarHistoriaTelegram(post, marca) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        functions.logger.warn("[publicador] Sin TELEGRAM_BOT_TOKEN. No se puede notificar.");
        return;
    }
    const assetUrl = post.assets_links[0] || "Sin asset generado";
    const mensaje = `📱 *Historia lista para publicar — ${marca.nombre_comercial}*\n\n` +
        `⚠️ Las Historias no se pueden publicar automáticamente. Súbela manualmente:\n\n` +
        `*Copy:*\n${post.contenido_generado.copy_instagram}\n\n` +
        `*Asset (descarga y sube):*\n${assetUrl}`;
    await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: marca.credenciales_redes.telegram_chat_id,
        text: mensaje,
        parse_mode: "Markdown",
    });
    functions.logger.info(`[publicador] Notificación de Historia enviada por Telegram a ${marca.nombre_comercial}`);
}
/**
 * Notifica al operador por Telegram para que publique el contenido manualmente
 * si la marca tiene desactivada la publicación automática.
 */
async function notificarPublicacionManualTelegram(post, marca) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken)
        return;
    const assetsLinks = post.assets_links.map((link, idx) => `[Asset ${idx + 1}](${link})`).join("\n");
    const mensaje = `🚀 *Nuevo Contenido Generado — ${marca.nombre_comercial}*\n\n` +
        `_Publicación automática desactivada. Por favor, súbelo manualmente:_\n\n` +
        `*Copy:*\n${post.contenido_generado.copy_instagram}\n\n` +
        `*Archivos:*\n${assetsLinks}`;
    await axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: marca.credenciales_redes.telegram_chat_id,
        text: mensaje,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
    });
}
// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
/** Espera que el contenedor de video de Meta termine de procesarse. */
async function esperarProcesamientoMeta(igBusinessId, creationId, token, maxIntentos = 10) {
    for (let intento = 0; intento < maxIntentos; intento++) {
        await sleep(5000); // Esperar 5s entre cada consulta
        const statusRes = await axios_1.default.get(`${META_GRAPH_BASE}/${creationId}`, {
            params: {
                fields: "status_code",
                access_token: token,
            },
        });
        const statusCode = statusRes.data.status_code;
        functions.logger.info(`[publicador] Estado del contenedor ${creationId}: ${statusCode} (intento ${intento + 1}/${maxIntentos})`);
        if (statusCode === "FINISHED")
            return;
        if (statusCode === "ERROR") {
            throw new Error(`Meta rechazó el video. Status: ${statusCode}`);
        }
    }
    throw new Error(`[publicador] Timeout esperando que Meta procese el video. ID: ${creationId}`);
}
/** Helper para esperar N milisegundos. */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=publicadorContenidoInstagram.js.map