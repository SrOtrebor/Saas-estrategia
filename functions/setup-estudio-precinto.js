/**
 * setup-estudio-precinto.js
 * Configura Estudio Precinto como marca real en Firestore
 * y sube el logo SVG a Firebase Storage.
 * Ejecutar con: node setup-estudio-precinto.js
 */

const admin = require("./node_modules/firebase-admin");
const cert = require("../saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json");
const path = require("path");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(cert),
    storageBucket: "saas-estrategias.firebasestorage.app",
  });
}

const bucket = admin.storage().bucket();
const db = admin.firestore();

async function run() {
  console.log("\n🏗️  Configurando Estudio Precinto...\n");

  // ─── 1. Subir logo SVG ──────────────────────────────────────
  const logoSrc = path.join(__dirname, "../logofull.svg");
  const logoDest = "logos/estudio_precinto/logofull.svg";

  await bucket.upload(logoSrc, {
    destination: logoDest,
    metadata: { contentType: "image/svg+xml" },
  });
  await bucket.file(logoDest).makePublic();
  const logoUrl =
    "https://storage.googleapis.com/" + bucket.name + "/" + logoDest;
  console.log("✅ Logo subido:", logoUrl);

  // ─── 2. Actualizar marca en Firestore ───────────────────────
  const marcaData = {
    id_marca: "marca_demo", // mantenemos el ID para no romper el flujo
    nombre_comercial: "Estudio Precinto",

    datos_negocio: {
      rubro: "Consultoría de ingeniería operativa, desarrollo de software a medida y soluciones digitales",
      publico_objetivo:
        "Dueños de negocios y empresas de Argentina con procesos operativos caóticos: " +
        "planillas de Excel desbordadas, datos duplicados, flujos manuales trabados. " +
        "Buscan recuperar el control de su operación sin depender de tecnicismos.",
      propuesta_valor:
        "Somos el Socio Estratégico que mapea y elimina los agujeros negros operativos, " +
        "construye sistemas centralizados, transparentes y escalables, y diseña campañas digitales " +
        "que inyectan tráfico calificado directo a la infraestructura interna del cliente. " +
        "Filosofía: 'El diseño que atrae no sirve de nada sin la ingeniería que factura.'",
    },

    comunicacion: {
      tono_de_voz:
        "Directo, conciso, seguro y profesional. " +
        "Usa analogías de construcción e ingeniería: capó, motor, engranajes, cimientos, andamiaje, bajo el capó. " +
        "Transmite autoridad técnica con los pies en la tierra: calle y realidad de negocio, sin tecnicismos abstractos. " +
        "CIERRE OBLIGATORIO: Siempre finaliza las comunicaciones importantes con la frase 'Orden y firmeza.' " +
        "Idioma: español rioplatense.",
      pilares_contenido: [
        "Casos de éxito — resultados reales y medibles de sistemas implementados en clientes",
        "Educación operativa — cómo dejar de ser el bombero y convertirse en Director de Obra de tu empresa",
        "Detrás de cámaras — el proceso real de diagnóstico, ingeniería y desarrollo de plataformas",
        "Filosofía de negocio — la diferencia entre un folleto digital y una máquina operativa que factura",
        "Pauta digital y branding — campañas que convierten tráfico en ventas reales, no likes vacíos",
      ],
      cuentas_referencia: [
        "@alexhormozi",
        "@garyvee",
        "@patrickbetdavid",
      ],
    },

    identidad_visual: {
      color_primario_hex: "#A28A68",   // Bronce cálido — del gradiente del logo
      color_secundario_hex: "#0D1117", // Negro técnico — fondo oscuro
      logo_url: logoUrl,
    },

    credenciales_redes: {
      telegram_chat_id: "677028989",
      instagram_business_id: "PENDIENTE",
    },

    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection("marcas").doc("marca_demo").set(marcaData, { merge: true });
  console.log("✅ Firestore actualizado con datos de Estudio Precinto");

  console.log("\n🎉 ¡Configuración completa!");
  console.log("   Ya podés mandarle un mensaje al bot para probar con la marca real.\n");
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
