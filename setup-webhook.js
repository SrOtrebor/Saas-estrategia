/**
 * setup-webhook.js
 * Registra la URL del webhook de Firebase en Telegram.
 * Ejecutar UNA SOLA VEZ después de cada deploy.
 * Uso: node setup-webhook.js
 */

require("dotenv").config({ path: "./functions/.env" });
const https = require("https");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

// URL de la función desplegada en Firebase
const WEBHOOK_URL =
  "https://us-central1-saas-estrategias.cloudfunctions.net/ingestaEntradaEspontanea";

function telegramPost(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function setup() {
  console.log("\n🔧 Configurando webhook de Telegram...\n");
  console.log(`   Bot token: ${BOT_TOKEN?.substring(0, 15)}...`);
  console.log(`   Webhook URL: ${WEBHOOK_URL}`);
  console.log(`   Secret: ${WEBHOOK_SECRET}\n`);

  // 1. Eliminar webhook anterior si existe
  console.log("🗑️  Eliminando webhook anterior...");
  const del = await telegramPost("deleteWebhook", { drop_pending_updates: true });
  console.log("   Resultado:", del.ok ? "✅ OK" : `❌ ${del.description}`);

  // 2. Registrar nuevo webhook
  console.log("\n📡 Registrando nuevo webhook...");
  const set = await telegramPost("setWebhook", {
    url: WEBHOOK_URL,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message"],
    max_connections: 40,
  });
  console.log("   Resultado:", set.ok ? "✅ OK" : `❌ ${set.description}`);

  if (!set.ok) {
    console.error("\n❌ Error al registrar el webhook:", set.description);
    process.exit(1);
  }

  // 3. Verificar
  console.log("\n🔍 Verificando configuración...");
  const info = await telegramPost("getWebhookInfo", {});
  const w = info.result;
  console.log(`   URL registrada: ${w.url}`);
  console.log(`   Pendientes: ${w.pending_update_count}`);
  console.log(`   Último error: ${w.last_error_message ?? "ninguno"}`);

  console.log("\n🎉 ¡Webhook configurado! El bot está listo.");
  console.log("   Abrí Telegram y mandá un mensaje a @EstudioPrecintoBot\n");
}

setup().catch(console.error);
