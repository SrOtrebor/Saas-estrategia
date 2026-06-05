/**
 * seed.js
 * ─────────────────────────────────────────────────────────────
 * Script de inicialización de datos para la primera marca demo.
 * Ejecutar UNA SOLA VEZ con: node seed.js
 * ─────────────────────────────────────────────────────────────
 */

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// ─── Verificar que existe el archivo de credenciales ─────────
const serviceAccountPath = path.join(__dirname, "saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("\n❌ ERROR: No se encontró el archivo de credenciales en functions/");
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ─── Datos de la marca demo ───────────────────────────────────
const marcaDemo = {
  id_marca: "marca_demo",
  nombre_comercial: "Panadería Demo",
  datos_negocio: {
    rubro: "Panadería Artesanal",
    publico_objetivo: "Familias y adultos de 25-50 años que valoran la alimentación natural y el producto artesanal local",
    propuesta_valor: "Pan sin conservantes, amasado a mano cada mañana con ingredientes locales y recetas de autor",
  },
  comunicacion: {
    tono_de_voz:
      "Cálido, cercano y apasionado. Hablamos como un vecino que ama lo que hace, no como una empresa. " +
      "Usamos frases cortas y directas. Evitamos tecnicismos. " +
      "Siempre incluimos un llamado a la acción emocional al final del texto. " +
      "Nunca usamos signos de exclamación más de una vez por post. " +
      "Idioma: español rioplatense.",
    pilares_contenido: [
      "Detrás de cámaras — mostrar el proceso artesanal de elaboración",
      "Educación al cliente — contar el por qué de cada ingrediente o técnica",
      "Producto estrella — destacar un producto específico del día o la semana",
      "Testimonios y comunidad — historias reales de clientes",
      "Temporalidad — contenido vinculado a fechas o estaciones del año",
    ],
    cuentas_referencia: [
      "@tartine_manufactory",
      "@panaderiaelcampo",
      "@lapanaderiabuenosaires",
    ],
  },
  identidad_visual: {
    color_primario_hex: "#C8703A",
    color_secundario_hex: "#F5ECD7",
    logo_url: "https://via.placeholder.com/400x400.png?text=LOGO", // Reemplazar con URL real del logo
    bannerbear_template_feed_id: "REEMPLAZAR_CON_ID_REAL",
    bannerbear_template_story_id: "REEMPLAZAR_CON_ID_REAL",
  },
  credenciales_redes: {
    instagram_business_id: "REEMPLAZAR_CON_ID_REAL",
    telegram_chat_id: "REEMPLAZAR_CON_CHAT_ID",
  },
  updated_at: admin.firestore.FieldValue.serverTimestamp(),
};

// ─── Cargar datos en Firestore ────────────────────────────────
async function seed() {
  console.log("\n🌱 Iniciando carga de datos demo...\n");

  try {
    // Actualizar el documento marca_demo (ya existe, lo completamos)
    await db.collection("marcas").doc("marca_demo").set(marcaDemo, { merge: true });
    console.log("✅ Marca 'marca_demo' (Panadería Demo) actualizada correctamente");

    // Crear también la colección cola_ingesta vacía con un doc placeholder
    // (Firestore no crea colecciones vacías; este doc se puede borrar después)
    await db.collection("cola_ingesta").doc("_placeholder").set({
      info: "Esta colección recibe inputs espontáneos desde Telegram. Este documento se puede borrar.",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("✅ Colección 'cola_ingesta' inicializada");

    // Crear colección planificador_contenido con doc placeholder
    await db.collection("planificador_contenido").doc("_placeholder").set({
      info: "Esta colección contiene la grilla de posts generados por la IA. Este documento se puede borrar.",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("✅ Colección 'planificador_contenido' inicializada");

    console.log("\n🎉 ¡Base de datos inicializada con éxito!");
    console.log("\n📌 PRÓXIMOS PASOS:");
    console.log("   1. Reemplazá los campos 'REEMPLAZAR_CON_ID_REAL' en Firestore con tus datos reales");
    console.log("   2. Subí el logo real a Firebase Storage y actualizá logo_url");
    console.log("   3. Configurá el archivo functions/.env con tus API Keys");
    console.log("   4. Ejecutá: firebase emulators:start\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error durante el seed:", error);
    process.exit(1);
  }
}

seed();
