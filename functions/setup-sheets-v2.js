require('dotenv').config({ path: './.env' });
process.env.GOOGLE_APPLICATION_CREDENTIALS = './saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json';
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;

async function run() {
  if (!SPREADSHEET_ID) {
    console.error("Falta GOOGLE_SHEETS_ID");
    return;
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  console.log("Limpiando hoja y configurando cabeceras...");

  // 1. Limpiar toda la hoja (Hoja 1 asumiendo Sheet1 o la primera hoja)
  // Como no sabemos el nombre exacto de la hoja, usamos el primer sheet del documento.
  const spread = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetId = spread.data.sheets[0].properties.sheetId;
  const sheetName = spread.data.sheets[0].properties.title;

  try {
    // 1. Limpiar valores
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:K`,
    });

    // 2. Insertar Cabecera
    const cabecera = [
      ["ID Post", "Fecha Creación", "Fecha Publicación Sugerida", "ID Marca", "Formato", "Título / Gancho", "Copy (Texto Instagram)", "Hashtags", "Estado", "Imágenes Generadas", "Fecha Publicado"]
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:K1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: cabecera },
    });

    // 3. Formatear la cabecera (Fondo azul marino, texto blanco, negrita, congelar fila)
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
                  backgroundColor: { red: 14/255, green: 19/255, blue: 43/255 }, // #0e132b
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                    fontSize: 11
                  },
                  horizontalAlignment: "CENTER",
                  verticalAlignment: "MIDDLE"
                }
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
            }
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheetId,
                gridProperties: {
                  frozenRowCount: 1 // Congelar cabecera
                }
              },
              fields: "gridProperties.frozenRowCount"
            }
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: 11
              }
            }
          }
        ]
      }
    });

    console.log("¡Planilla formateada con éxito!");
  } catch (err) {
    console.error("Error al configurar:", err.message);
  }
}

run();
