const { google } = require("googleapis");
const cert = require("../saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json");

const SPREADSHEET_ID = "1cxlcZXBP_y6M5FrcYD7ZkBiZ3tBMT1GK3Gnxme6_neM";

async function run() {
  console.log("Autenticando con Google Sheets...");
  const auth = new google.auth.GoogleAuth({
    credentials: cert,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    console.log("Conectando al Sheet...");
    // Intentar leer el nombre de la hoja
    const res = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    const sheetName = res.data.sheets[0].properties.title;
    console.log(`✅ Conexión exitosa. Hoja principal: ${sheetName}`);

    // Configurar cabeceras
    console.log("Configurando cabeceras...");
    const cabeceras = [
      "ID Post",
      "Fecha Generado",
      "Fecha Sugerida",
      "Marca",
      "Formato",
      "Título Gancho",
      "Copy",
      "Hashtags",
      "Estado",
      "URLs Imágenes",
      "Fecha Publicado"
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:K1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [cabeceras],
      },
    });
    
    // Dar formato negrita a las cabeceras
    const sheetId = res.data.sheets[0].properties.sheetId;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 11
              },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                }
              },
              fields: "userEnteredFormat(textFormat,backgroundColor)"
            }
          }
        ]
      }
    });

    console.log("✅ Cabeceras configuradas correctamente.");
    process.exit(0);

  } catch (error) {
    console.error("❌ Error de Sheets:", error.message);
    if (error.message.includes("API has not been used")) {
      console.log("\n⚠️ ATENCIÓN: La API de Google Sheets no está habilitada en Google Cloud.");
    } else if (error.message.includes("caller does not have permission") || error.message.includes("403")) {
      console.log(`\n⚠️ ATENCIÓN: Tenés que darle acceso de EDITOR en tu Google Sheet al correo:\nfirebase-adminsdk-fbsvc@saas-estrategias.iam.gserviceaccount.com`);
    }
    process.exit(1);
  }
}

run();
