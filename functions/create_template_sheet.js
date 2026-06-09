const { google } = require("googleapis");

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "./saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json",
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive"
    ],
  });

  const sheetsClient = google.sheets({ version: "v4", auth });
  const driveClient = google.drive({ version: "v3", auth });

  try {
    const createRes = await sheetsClient.spreadsheets.create({
      requestBody: {
        properties: { title: "Plantilla Maestra - Planificación Semanal" },
        sheets: [{
          properties: { sheetId: 0, title: "Planificación" },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                { userEnteredValue: { stringValue: "Día" } },
                { userEnteredValue: { stringValue: "Formato (Carrusel/Reel)" } },
                { userEnteredValue: { stringValue: "Copy" } },
                { userEnteredValue: { stringValue: "Hashtags" } },
                { userEnteredValue: { stringValue: "Tipo de estrategia" } },
                { userEnteredValue: { stringValue: "Link del contenido" } },
                { userEnteredValue: { stringValue: "Estado (Botón)" } }
              ]
            }]
          }]
        }]
      },
    });

    const sheetId = createRes.data.spreadsheetId;
    console.log("Sheet ID:", sheetId);

    await driveClient.permissions.create({
      fileId: sheetId,
      requestBody: {
        role: "writer",
        type: "anyone",
      },
    });

    console.log(`Link público de la plantilla: https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
  } catch (err) {
    console.error("Error", err);
  }
}

main();
