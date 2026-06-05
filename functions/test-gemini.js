/**
 * test-gemini.js
 * Versión actualizada con el nuevo SDK @google/genai
 * Ejecutar con: node test-gemini.js
 */

require("dotenv").config({ path: "./.env" });
const { GoogleGenAI } = require("@google/genai");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ No se encontró GEMINI_API_KEY en el archivo .env");
  process.exit(1);
}

// ─── Datos de la marca demo ───────────────────────────────────
const prompt = `
Eres un estratega de contenido de Instagram de élite especializado en "Panadería Artesanal".

DATOS DEL NEGOCIO:
- Nombre: Panadería Demo
- Público objetivo: Familias y adultos de 25-50 años que valoran la alimentación natural
- Propuesta de valor: Pan sin conservantes, amasado a mano cada mañana con ingredientes locales

COMUNICACIÓN:
- Tono: Cálido, cercano y apasionado. Frases cortas. Español rioplatense. Un solo signo de exclamación por post.
- Pilares disponibles:
  1. Detrás de cámaras — mostrar el proceso artesanal
  2. Educación al cliente — contar el por qué de cada ingrediente
  3. Producto estrella — destacar un producto del día
  4. Testimonios y comunidad
  5. Temporalidad — contenido vinculado a fechas

Generá UN post para Instagram eligiendo el pilar más estratégico.

Respondé ÚNICAMENTE con este JSON (sin texto extra, sin markdown):
{
  "titulo_gancho": "máximo 10 palabras que generen curiosidad",
  "copy_instagram": "caption completo con emojis, saltos de línea y 15 hashtags al final",
  "textos_capas_graficas": ["texto slide 1", "texto slide 2", "texto slide 3"],
  "hashtags": "#hashtag1 #hashtag2 ...",
  "fecha_hora_sugerida_iso": "ISO 8601 dentro de los próximos 7 días a las 12:00 o 20:00",
  "formato_recomendado": "CARRUSEL"
}
`.trim();

async function main() {
  console.log("\n🤖 Conectando con Google Gemini 2.5 Flash...\n");

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.85,
      },
    });

    const raw = response.text;
    const parsed = JSON.parse(raw);

    console.log("✅ ¡Gemini respondió correctamente!\n");
    console.log("═══════════════════════════════════════════");
    console.log(`📌 FORMATO:        ${parsed.formato_recomendado}`);
    console.log(`🎯 GANCHO:         ${parsed.titulo_gancho}`);
    console.log(`📅 FECHA SUGERIDA: ${parsed.fecha_hora_sugerida_iso}`);
    console.log("═══════════════════════════════════════════");
    console.log("\n📝 COPY INSTAGRAM:");
    console.log("───────────────────────────────────────────");
    console.log(parsed.copy_instagram);
    console.log("───────────────────────────────────────────");

    if (parsed.textos_capas_graficas?.length) {
      console.log("\n🖼️  TEXTOS PARA CARRUSEL:");
      parsed.textos_capas_graficas.forEach((t, i) => {
        console.log(`   Slide ${i + 1}: ${t}`);
      });
    }

    console.log("\n#️⃣  HASHTAGS:");
    console.log(`   ${parsed.hashtags}`);
    console.log("\n🎉 ¡El sistema está funcionando! La IA generó el primer post.\n");

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

main();
