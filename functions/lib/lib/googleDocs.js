"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearDocumentoExpandido = crearDocumentoExpandido;
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
let docsClient = null;
let driveClient = null;
async function getGoogleClients() {
    if (docsClient && driveClient)
        return { docsClient, driveClient };
    if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID === "PENDIENTE") {
        throw new Error("Falta la variable de entorno GOOGLE_DRIVE_FOLDER_ID o está en PENDIENTE");
    }
    // Se importa dentro de la función (lazy loading) para evitar el Timeout de Firebase al hacer deploy
    // ya que googleapis es una librería extremadamente grande que demora en cargarse.
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({
        scopes: [
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive.file"
        ],
    });
    docsClient = google.docs({ version: "v1", auth });
    driveClient = google.drive({ version: "v3", auth });
    return { docsClient, driveClient };
}
async function crearDocumentoExpandido(titulo, contenido) {
    try {
        const { docsClient, driveClient } = await getGoogleClients();
        // 1. Crear el documento
        const doc = await docsClient.documents.create({
            requestBody: {
                title: titulo,
            },
        });
        const documentId = doc.data.documentId;
        // 2. Insertar el contenido en el documento
        // Google Docs API requiere insertar texto en un index. 
        // El documento vacío tiene un enter (\n) en el index 1.
        await docsClient.documents.batchUpdate({
            documentId,
            requestBody: {
                requests: [
                    {
                        insertText: {
                            location: { index: 1 },
                            text: contenido,
                        },
                    },
                ],
            },
        });
        // 3. Mover el archivo a la carpeta especificada en Drive
        // Primero obtenemos los parents actuales para removerlos
        const file = await driveClient.files.get({
            fileId: documentId,
            fields: "parents",
        });
        const previousParents = file.data.parents?.join(",") || "";
        await driveClient.files.update({
            fileId: documentId,
            addParents: DRIVE_FOLDER_ID,
            removeParents: previousParents,
            fields: "id, parents",
        });
        console.log(`[Google Docs] Documento creado y movido: ${documentId}`);
        // Retornamos la URL pública (o de edición compartida)
        return `https://docs.google.com/document/d/${documentId}/edit`;
    }
    catch (error) {
        console.error(`[Google Docs] Error al crear documento: ${error.message}`);
        throw error;
    }
}
//# sourceMappingURL=googleDocs.js.map