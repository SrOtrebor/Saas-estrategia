"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearDocumentoEnCarpeta = crearDocumentoEnCarpeta;
exports.agregarGuionADocumentoExistente = agregarGuionADocumentoExistente;
exports.agregarGuionADocumento = agregarGuionADocumento;
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
let docsClient = null;
let driveClient = null;
async function getGoogleClients() {
    if (docsClient && driveClient)
        return { docsClient, driveClient };
    // Si no hay DRIVE_FOLDER_ID, el archivo quedará en la raíz del Drive.
    if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID === "PENDIENTE") {
        console.warn("[Google Docs] No hay GOOGLE_DRIVE_FOLDER_ID. Los docs irán a la raíz.");
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
async function crearDocumentoEnCarpeta(titulo, contenido, folderId) {
    try {
        const { docsClient, driveClient } = await getGoogleClients();
        // 1. Crear el documento
        const docResponse = await docsClient.documents.create({
            requestBody: {
                title: titulo,
            },
        });
        const documentId = docResponse.data.documentId;
        // 2. Mover el documento a la carpeta específica del cliente
        if (folderId && folderId !== "PENDIENTE") {
            // Obtenemos los parents actuales para removerlos (usualmente 'root')
            const file = await driveClient.files.get({
                fileId: documentId,
                fields: "parents",
            });
            const previousParents = file.data.parents?.join(",") || "";
            await driveClient.files.update({
                fileId: documentId,
                addParents: folderId,
                removeParents: previousParents,
                fields: "id, parents",
            });
        }
        // 3. Insertar el contenido
        // Como el documento es nuevo, insertamos al principio (index: 1)
        await docsClient.documents.batchUpdate({
            documentId,
            requestBody: {
                requests: [
                    {
                        insertText: {
                            location: { index: 1 },
                            text: contenido + "\n",
                        },
                    },
                ],
            },
        });
        console.log(`[Google Docs] Documento creado y guardado en carpeta: ${documentId}`);
        return `https://docs.google.com/document/d/${documentId}/edit`;
    }
    catch (error) {
        console.error(`[Google Docs] Error al crear documento: ${error.message}`);
        throw error;
    }
}
async function agregarGuionADocumentoExistente(documentId, titulo, contenido) {
    if (!documentId || documentId === "PENDIENTE") {
        throw new Error("No hay ID de Google Doc configurado para esta marca.");
    }
    try {
        const { docsClient } = await getGoogleClients();
        const textoAInsertar = `\n\n════════════════════════════════════════\n[${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}] ${titulo}\n\n${contenido}\n`;
        // Insertamos al principio (index 1) para que los nuevos guiones queden arriba
        await docsClient.documents.batchUpdate({
            documentId,
            requestBody: {
                requests: [{ insertText: { location: { index: 1 }, text: textoAInsertar } }],
            },
        });
        return `https://docs.google.com/document/d/${documentId}/edit`;
    }
    catch (error) {
        console.error(`[Google Docs] Error al agregar guion al doc existente: ${error.message}`);
        throw error;
    }
}
async function agregarGuionADocumento(titulo, contenido) {
    // Mantenemos la original por retrocompatibilidad
    try {
        const { docsClient } = await getGoogleClients();
        const documentId = process.env.GOOGLE_DOC_CENTRAL_ID;
        if (!documentId)
            throw new Error("No hay GOOGLE_DOC_CENTRAL_ID configurado en el .env");
        const textoAInsertar = `\n\n════════════════════════════════════════\n[${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}] ${titulo}\n\n${contenido}\n`;
        await docsClient.documents.batchUpdate({
            documentId,
            requestBody: {
                requests: [{ insertText: { location: { index: 1 }, text: textoAInsertar } }],
            },
        });
        return `https://docs.google.com/document/d/${documentId}/edit`;
    }
    catch (error) {
        throw error;
    }
}
//# sourceMappingURL=googleDocs.js.map