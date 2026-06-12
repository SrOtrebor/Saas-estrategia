"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepararSemanaEnPlanilla = prepararSemanaEnPlanilla;
exports.actualizarFilaPlanilla = actualizarFilaPlanilla;
exports.actualizarPlanillaExistente = actualizarPlanillaExistente;
const googleapis_1 = require("googleapis");
let sheetsClient = null;
async function getSheetsClient() {
    if (sheetsClient)
        return sheetsClient;
    const auth = new googleapis_1.google.auth.GoogleAuth({
        scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
        ],
    });
    sheetsClient = googleapis_1.google.sheets({ version: "v4", auth });
    return sheetsClient;
}
async function prepararSemanaEnPlanilla(sheetId, filas) {
    if (!sheetId || sheetId === "PENDIENTE") {
        throw new Error("No hay ID de Google Sheets configurado para esta marca.");
    }
    const sheets = await getSheetsClient();
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: "A1:G1",
        });
        const headerExists = res.data.values && res.data.values.length > 0 && res.data.values[0][0] === "Día";
        if (!headerExists) {
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
        const values = filas.map(f => [
            f.dia,
            f.formato,
            f.copy,
            f.hashtags,
            f.tipoEstrategia,
            f.linkContenido,
            f.estado
        ]);
        const appendRes = await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: "A:G",
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values,
            },
        });
        const updatedRange = appendRes.data.updates?.updatedRange;
        let startRow = -1;
        if (updatedRange) {
            const match = updatedRange.match(/![A-Z]+(\d+)/);
            if (match && match[1]) {
                startRow = parseInt(match[1]);
            }
        }
        if (startRow === -1) {
            throw new Error("No se pudo determinar el índice de fila insertada.");
        }
        return filas.map((_, i) => startRow + i);
    }
    catch (error) {
        console.error("[Google Sheets] Error preparando la semana en la planilla:", error);
        throw error;
    }
}
async function actualizarFilaPlanilla(sheetId, rowIndex, fila) {
    if (!sheetId || sheetId === "PENDIENTE") {
        throw new Error("No hay ID de Google Sheets configurado para esta marca.");
    }
    const sheets = await getSheetsClient();
    try {
        const values = [
            [
                fila.dia,
                fila.formato,
                fila.copy,
                fila.hashtags,
                fila.tipoEstrategia,
                fila.linkContenido,
                fila.estado
            ]
        ];
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `A${rowIndex}:G${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values,
            },
        });
        return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`;
    }
    catch (error) {
        console.error(`[Google Sheets] Error actualizando la fila ${rowIndex}:`, error);
        throw error;
    }
}
async function actualizarPlanillaExistente(sheetId, filas) {
    // Mantener compatibilidad hacia atrás si es necesario
    await prepararSemanaEnPlanilla(sheetId, filas);
    return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`;
}
//# sourceMappingURL=googleSheets.js.map