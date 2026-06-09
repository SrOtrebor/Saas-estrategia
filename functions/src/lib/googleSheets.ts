import { google } from "googleapis";

let sheetsClient: any = null;

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

export interface FilaPlanificacion {
  dia: string;
  formato: string;
  copy: string;
  hashtags: string;
  tipoEstrategia: string;
  linkContenido: string;
  estado: string; // "Pendiente" o "Publicado"
}

export async function actualizarPlanillaExistente(sheetId: string, filas: FilaPlanificacion[]): Promise<string> {
  if (!sheetId || sheetId === "PENDIENTE") {
    throw new Error("No hay ID de Google Sheets configurado para esta marca.");
  }

  const sheets = await getSheetsClient();

  try {
    // Verificar si la primera fila ya tiene encabezados leyendo la primera fila
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "A1:G1",
    });

    const headerExists = res.data.values && res.data.values.length > 0 && res.data.values[0][0] === "Día";

    if (!headerExists) {
      // Escribir los encabezados primero si no existen
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: "A1:G1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            [
              "Día",
              "Formato (Carrusel/Reel)",
              "Copy",
              "Hashtags",
              "Tipo de estrategia",
              "Link del contenido",
              "Estado (Botón)"
            ]
          ]
        }
      });
    }

    // Preparar filas
    const values = filas.map(f => [
      f.dia,
      f.formato,
      f.copy,
      f.hashtags,
      f.tipoEstrategia,
      f.linkContenido,
      f.estado
    ]);

    // Append de las filas de planificación
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "A:G",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values,
      },
    });

    return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  } catch (error) {
    console.error("[Google Sheets] Error actualizando la planilla:", error);
    throw error;
  }
}
