# SaaS Estrategias - Bot de Automatización Instagram & Docs

Este repositorio contiene las Cloud Functions (Firebase) que potencian el Bot de Telegram "SaaS Estrategias". Es un sistema impulsado por IA que ingiere notas de voz y textos, ideando estrategias y diseñando contenido visual directamente para Instagram.

## Características Principales:

1. **Ingesta y Escucha (Telegram Webhook)**: Escucha los mensajes de los usuarios (texto o audio) y guarda los datos en crudo (`ingestaEntradaEspontanea`).
2. **Generación de Contenido (Puppeteer + Gemini 2.0 Flash)**: Procesa las ideas y genera Carruseles para Instagram listos para publicar (`generarContenidoEspontaneo`).
   - Construye copies persuasivos (Hook, Cuerpo, Remate).
   - Aplica **"Plantillas Ajedrez"**: Una ruleta de 8 diseños variados (Claros, Oscuros, Split Screen, Brutalistas, etc.) para que el feed sea dinámico.
   - Analiza la luminosidad de la identidad de la marca. Si el color primario es muy oscuro, lo ilumina matemáticamente en los diseños oscuros para mantener un contraste premium constante.
   - Renderiza el HTML a JPEGs usando `@sparticuz/chromium` headless.
3. **Generación de Documentos Estratégicos (Google Docs)**: Expande el pensamiento inicial en documentos largos o guiones en Google Docs y Drive (`generarDocumentosEspontaneos`).
4. **Registro en Sheets y Automatización**: Guarda el historial y lo planifica en una Grilla Semanal (`generarGrillaSemanal`).
5. **Publicador Automático**: Un Cron Job que toma los posts y los publica en la cuenta de Instagram conectada mediante la API oficial (`publicadorContenidoInstagram`).

## Tecnologías

- **Backend**: Firebase Cloud Functions (Node.js 22), Firestore, Firebase Storage
- **IA Generativa**: `@google/genai` (Gemini 2.0 Flash)
- **Motor Gráfico Headless**: `@sparticuz/chromium` & `puppeteer-core`
- **Integraciones**: Telegram Bot API, Google Docs API, Google Sheets API, Instagram Graph API

## Configuración y Variables de Entorno

Asegurarse de tener configurado `.env` dentro de `/functions`:
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SECRET_TOKEN`
- `GOOGLE_SERVICE_ACCOUNT` (en base64, para Sheets y Docs)
- Credenciales de la app de Facebook/Instagram.

## Despliegue

```bash
cd functions
npm run build
npm run deploy
```
