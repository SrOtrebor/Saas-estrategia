"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agregarFilaPost = agregarFilaPost;
const googleapis_1 = require("googleapis");
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
// Cache del cliente autenticado
let sheetsClient = null;
async function getSheetsClient() {
    if (sheetsClient)
        return sheetsClient;
    if (!SPREADSHEET_ID) {
        throw new Error("Falta la variable de entorno GOOGLE_SHEETS_ID");
    }
    // Firebase Admin SDK provee auth predeterminado con los permisos del Service Account
    const auth = new googleapis_1.google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsClient = googleapis_1.google.sheets({ version: "v4", auth });
    return sheetsClient;
}
async function agregarFilaPost(postId, idMarca, tituloGancho, copy, hashtags, urlsImagenes, estado) {
    try {
        const sheets = await getSheetsClient();
        // Formatear fecha
        const fechaActual = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
        const imagenesStr = urlsImagenes.join("\n");
        const fila = [
            postId,
            fechaActual,
            "TBD", // Fecha Sugerida (podríamos parsear fecha_hora_sugerida_iso)
            idMarca,
            "CARRUSEL",
            tituloGancho,
            copy,
            hashtags,
            estado,
            imagenesStr,
            "" // Fecha publicado (vacío por ahora)
        ];
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "A1", // Append detecta la última fila automáticamente
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [fila],
            },
        });
        console.log(`[Google Sheets] Fila agregada para post ${postId}`);
    }
    catch (error) {
        console.error(`[Google Sheets] Error al agregar fila: ${error.message}`);
        // No lanzamos el error para no romper el flujo de la aplicación si Sheets falla
    }
}
//# sourceMappingURL=googleSheets.js.map