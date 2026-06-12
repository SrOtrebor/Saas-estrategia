const fs = require('fs');
let code = fs.readFileSync('functions/src/functions/ingestaEntradaEspontanea.ts', 'utf8');

const regex1 = /if \(message\.text && message\.text\.trim\(\) === "\/test_plantillas"\) \{/g;
code = code.replace(regex1, 'if (message.text && message.text.trim() === "/test_plantillas") {\n        if (!marca.plantillas || marca.plantillas.length === 0) {\n          await enviarMensaje(chatId, "⚠️ Este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para activar la generación visual.");\n          res.status(200).send("OK");\n          return;\n        }');

const regex2 = /if \(message\.text && message\.text\.trim\(\) === "\/test"\) \{/g;
code = code.replace(regex2, 'if (message.text && message.text.trim() === "/test") {\n        if (!marca.plantillas || marca.plantillas.length === 0) {\n          await enviarMensaje(chatId, "⚠️ Este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para activar la generación visual.");\n          res.status(200).send("OK");\n          return;\n        }');

const regex3 = /\/\/ ─── Paso 2: Si no es comando, enviar a cola_ingesta ──────\n      if \(!message\.text\?\.startsWith\("\/"\)\) \{/g;
code = code.replace(regex3, '\/\/ ─── Paso 2: Si no es comando, enviar a cola_ingesta ──────\n      if (!message.text?.startsWith("/")) {\n        if (!marca.plantillas || marca.plantillas.length === 0) {\n          await enviarMensaje(chatId, "⚠️ ¡Hola! Recibí tu mensaje, pero este cliente no tiene plantillas cargadas. Por favor, ve al panel web y carga al menos una plantilla para poder armar los diseños.");\n          res.status(200).send("OK");\n          return;\n        }');

fs.writeFileSync('functions/src/functions/ingestaEntradaEspontanea.ts', code);
