# SaaS Estrategias - Bot de Automatización Instagram & Docs

Este repositorio contiene las Cloud Functions (Firebase) que potencian el Bot de Telegram "SaaS Estrategias". 

## Características Principales:
1. **Ingesta y Escucha (Telegram Webhook)**: Escucha los mensajes de los usuarios y comandos para iniciar ideación o ejecución.
2. **Ideación (Gemini 2.5 Flash)**: Genera ideas de contenido basadas en las tendencias actuales y la marca del usuario.
3. **Generación de Documentos (Google Docs)**: Expande las ideas aprobadas en guiones completos y los guarda en una carpeta de Google Drive.
4. **Diseño Web Dinámico a Imagen (Puppeteer + Gemini)**: Genera placas gráficas para Instagram usando HTML/CSS creados por IA y capturados vía Puppeteer/Sparticuz Chromium.
5. **Registro en Sheets**: Guarda el historial de posts y links en Google Sheets.
6. **Publicador Automático**: Un Cron Job que toma los posts "Aprobados" en el Sheet y los publica automáticamente en Instagram Graph API.

## Tecnologías
- Firebase Cloud Functions (Node.js 22)
- Google Cloud Firestore
- `@google/genai` (Gemini API)
- `@sparticuz/chromium` & `puppeteer-core` (Renderizado HTML -> JPG)
- Telegram Bot API
- Google Docs & Sheets API

## Configuración y Variables de Entorno
Asegurarse de tener configurado en Firebase Functions:
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- Credenciales de la cuenta de servicio de Google (para Docs y Sheets).
