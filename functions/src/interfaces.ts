/**
 * interfaces.ts
 * ─────────────────────────────────────────────────────────────
 * Modelos TypeScript para las colecciones de Firestore.
 * Estas interfaces son la "fuente de verdad" del esquema de datos.
 * ─────────────────────────────────────────────────────────────
 */

import { Timestamp } from "firebase-admin/firestore";

// ═══════════════════════════════════════════════════════════════
// COLECCIÓN: marcas
// Representa el "cerebro conceptual" de cada negocio/cliente.
// ═══════════════════════════════════════════════════════════════

export interface DatosNegocio {
  /** Industria o categoría del negocio (ej: "Panadería Artesanal", "Estudio Jurídico") */
  rubro: string;
  /** Descripción del cliente ideal (ej: "Madres de 28-45 años en CABA") */
  publico_objetivo: string;
  /** Propuesta de valor única (ej: "Pan sin conservantes, amasado a mano cada mañana") */
  propuesta_valor: string;
}

export interface ComunicacionConfig {
  /**
   * Directivas de copywriting para el prompt de IA.
   * Ej: "Cálido, cercano, evitar tecnicismos. Usar frases cortas.
   *      Siempre incluir un llamado a la acción emocional."
   */
  tono_de_voz: string;
  /**
   * Tópicos core de contenido. La IA rotará entre ellos para mantener variedad.
   * Ej: ["detrás de cámaras", "educación al cliente", "producto estrella", "testimonios"]
   */
  pilares_contenido: string[];
  /**
   * Cuentas de Instagram para inspiración/benchmarking.
   * Ej: ["@panaderiaelcampo", "@artisanbreadbcn"]
   */
  cuentas_referencia: string[];
}

export interface IdentidadVisual {
  /** Color primario en formato HEX. Ej: "#E63946" */
  color_primario_hex: string;
  /** Color secundario en formato HEX. Ej: "#F1FAEE" */
  color_secundario_hex: string;
  /**
   * URL del logo PNG con fondo transparente almacenado en Firebase Storage.
   * Ej: "https://storage.googleapis.com/saas-estrategias.appspot.com/logos/marca_abc.png"
   */
  logo_url: string;
}

export interface CredencialesRedes {
  /** ID de la cuenta profesional de Instagram conectada a Meta Graph API */
  instagram_business_id: string;
  /** ID del chat o canal de Telegram para alertas push a este cliente */
  telegram_chat_id: string;
}

/**
 * Documento principal de la colección `marcas`.
 * Path Firestore: /marcas/{id_marca}
 */
export interface MarcaConfig {
  /** Primary Key. Slug único del negocio. Ej: "estudio_precinto" */
  id_marca: string;
  /** Nombre visible del negocio. Ej: "Estudio Precinto" */
  nombre_comercial: string;
  datos_negocio: DatosNegocio;
  comunicacion: ComunicacionConfig;
  identidad_visual: IdentidadVisual;
  credenciales_redes: CredencialesRedes;
  /** Marca de tiempo de la última modificación de la configuración */
  updated_at?: Timestamp;
}

// ═══════════════════════════════════════════════════════════════
// COLECCIÓN: planificador_contenido
// Grilla de posts generados, pendientes de aprobación/publicación.
// ═══════════════════════════════════════════════════════════════

export type OrigenPost = "cron_semanal" | "input_espontaneo";
export type FormatoPost = "REELS" | "CARRUSEL" | "IMAGEN" | "HISTORIA";
export type EstadoPost =
  | "PENDIENTE"    // Generado por IA, esperando revisión humana
  | "APROBADO"     // Aprobado por el operador en el Panel de Control
  | "PROCESANDO"   // Siendo publicado actualmente (bloqueo optimista)
  | "PUBLICADO"    // Publicado con éxito en Instagram
  | "DESCARTADO";  // Rechazado por el operador

export interface ContenidoGenerado {
  /** Frase gancho inicial del post (máx 10 palabras). Ej: "El secreto que ninguna panadería te cuenta" */
  titulo_gancho: string;
  /** Caption completo de Instagram con emojis, saltos de línea y hashtags listos para publicar */
  copy_instagram: string;
  /**
   * Guión teleprompter para grabar un Reel.
   * Estructurado en bloques: intro → desarrollo → CTA.
   * Solo presente cuando formato === 'REELS'.
   */
  guion_reel_teleprompter?: string;
  /**
   * Array de textos cortos para inyectar en cada capa del template de Bannerbear.
   * El orden corresponde al orden de las capas definidas en el template.
   * Solo presente cuando formato === 'CARRUSEL' | 'IMAGEN' | 'HISTORIA'.
   */
  textos_capas_graficas?: string[];
}

/**
 * Documento de la colección `planificador_contenido`.
 * Path Firestore: /planificador_contenido/{id_post}
 */
export interface PosteoContenido {
  /** Auto-generado por Firestore al crear el documento */
  id_post: string;
  /** FK hacia /marcas/{id_marca} */
  id_marca: string;
  origen: OrigenPost;
  /**
   * Fecha y hora sugerida de publicación.
   * El publicador la respeta: solo publica si fecha_hora_sugerida <= ahora.
   */
  fecha_hora_sugerida: Timestamp;
  formato: FormatoPost;
  estado: EstadoPost;
  /** URL original que disparó el post (artículo, video de tendencia, etc.) */
  analisis_origen_url?: string;
  /** Contexto en texto libre enviado desde Telegram/Discord */
  contexto_input?: string;
  contenido_generado: ContenidoGenerado;
  /**
   * URLs de los assets finales:
   * - Para IMAGEN/CARRUSEL: URLs de las imágenes renderizadas por Bannerbear
   * - Para REELS: URL del video subido a Firebase Storage
   */
  assets_links: string[];
  /** ID del objeto publicado en Instagram (solo presente cuando estado === 'PUBLICADO') */
  instagram_media_id?: string;
  /** Número de fila en Google Sheets para poder actualizar su estado más adelante */
  sheets_row_index?: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ═══════════════════════════════════════════════════════════════
// AUXILIARES — Respuestas estructuradas de la IA
// ═══════════════════════════════════════════════════════════════

/**
 * Esquema JSON que la IA debe devolver obligatoriamente.
 * Se usa como system prompt para forzar output estructurado.
 */
export interface ContenidoGeneradoIA {
  titulo_gancho: string;
  copy_instagram: string;
  guion_reel_teleprompter?: string;
  textos_capas_graficas?: string[];
  /** Hashtags separados por espacio, ya incluidos en copy_instagram */
  hashtags: string;
  /** Propuesta de fecha/hora de publicación en formato ISO 8601 */
  fecha_hora_sugerida_iso: string;
  /** El formato que la IA recomienda para maximizar alcance */
  formato_recomendado: FormatoPost;
}

/**
 * Payload de la cola de ingesta (colección auxiliar `cola_ingesta`).
 * Se crea en ingestaEntradaEspontanea y se consume en generarContenidoEstrategico.
 */
export interface IngestaPayload {
  id_marca: string;
  tipo: "texto" | "link" | "audio";
  contenido_raw: string; // Texto transcrito o URL del link
  audio_url?: string;    // URL en Storage si era audio original
  created_at: Timestamp;
}
