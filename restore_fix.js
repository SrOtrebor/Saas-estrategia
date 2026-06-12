const fs = require('fs');

const path = 'functions/src/functions/ingestaEntradaEspontanea.ts';
let code = fs.readFileSync(path, 'utf8');

const testPlantillasBlock = `
      // ─── Paso 1.6: Comando de test de plantillas ──────────────
      if (message.text && message.text.trim() === "/test_plantillas") {
        if (!marca.plantillas || marca.plantillas.length === 0) {
          await enviarMensaje(chatId, "⚠️ Este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para activar la generación visual.");
          res.status(200).send("OK");
          return;
        }

        await enviarMensaje(chatId, "⏳ ¡Entendido! Generando muestrario con todas las plantillas. Esto puede demorar unos minutos, te las enviaré juntas apenas termine...");
        await db.collection("cola_test_plantillas").add({
          id_marca: marca.id_marca,
          chat_id: chatId,
          created_at: Timestamp.now()
        });
        res.status(200).send("OK");
        return;
      }
`;

// Insert the block before Paso 2
code = code.replace(
  /\/\/ ─── Paso 2: Detectar tipo de payload ───────────────────/g,
  testPlantillasBlock + '\n      // ─── Paso 2: Detectar tipo de payload ───────────────────'
);

// Add empty templates validation to /test command
code = code.replace(
  /if \(message\.text && message\.text\.trim\(\) === "\/test"\) \{/g,
  `if (message.text && message.text.trim() === "/test") {
        if (!marca.plantillas || marca.plantillas.length === 0) {
          await enviarMensaje(chatId, "⚠️ Este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para activar la generación visual.");
          res.status(200).send("OK");
          return;
        }`
);

// Add empty templates validation to Step 2 (general messages)
code = code.replace(
  /\/\/ ─── Paso 2: Si no es comando, enviar a cola_ingesta ──────\n      if \(!message\.text\?\.startsWith\("\/"\)\) \{/g,
  `// ─── Paso 2: Si no es comando, enviar a cola_ingesta ──────
      if (!message.text?.startsWith("/")) {
        if (!marca.plantillas || marca.plantillas.length === 0) {
          await enviarMensaje(chatId, "⚠️ ¡Hola! Recibí tu mensaje, pero este cliente no tiene plantillas cargadas en el sistema. Por favor, ve al panel web y carga al menos una plantilla para poder armar los diseños gráficos.");
          res.status(200).send("OK");
          return;
        }`
);

fs.writeFileSync(path, code);
