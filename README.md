# 🚀 SaaS Estrategias — Content AI Pipeline

Plataforma de automatización y generación de contenido impulsada por IA, construida para **Estudio Precinto**. 
El sistema permite que un operador envíe un mensaje a través de Telegram y obtenga ideas de contenido basadas en tendencias o genere automáticamente carruseles de Instagram completos (Copy, Hashtags y Diseño Gráfico) aplicando la identidad visual del cliente.

## 🏗️ Arquitectura y Tecnologías

El backend está construido de manera 100% serverless sobre **Firebase (Node.js 22)**:

- **Orquestador**: Firebase Cloud Functions (`generarContenidoEspontaneo`)
- **Base de Datos**: Firestore (colecciones: `marcas`, `cola_ingesta`, `sesiones_bot`, `planificador_contenido`)
- **Motor de Texto (Ideación y Copywriting)**: Gemini 2.5 Flash + **Google Search Grounding**
- **Motor de Imágenes (Fondos)**: Google Imagen 4 Fast
- **Motor Gráfico (Composición)**: Sharp (Node.js) + SVG Overlay dinámico (Tarjetas Elegantes con Glassmorphism)
- **Almacenamiento**: Firebase Storage (alberga logos y assets renderizados)
- **Notificaciones e Input**: API de Telegram Bot (Webhooks + Chunker de mensajes largos)

## 🔄 Flujo de Datos del Pipeline y Enrutamiento Inteligente

1. **Telegram Webhook (`ingestaEntradaEspontanea`)**: Recibe mensajes, identifica al cliente y los guarda en `cola_ingesta` de Firestore. Envía un mensaje genérico de recepción ("Procesando...").
2. **Disparador Firestore (`generarContenidoEspontaneo`)**: Lee la memoria del chat en `sesiones_bot` para dar contexto.
3. **Enrutamiento por IA**: Se consulta a Gemini para decidir la intención del usuario:
   - **IDEACION**: Si el usuario pide ideas o busca tendencias, Gemini utiliza **Google Search Grounding** para navegar la web y devolver ideas frescas, resúmenes de mercado y guiones formateados. El texto (si es muy largo) se corta en fragmentos de 4000 caracteres para eludir los límites de Telegram.
   - **EJECUCION**: Si el usuario proporciona un texto definitivo y pide generar el carrusel, Gemini extrae los slides. Se llama a **Imagen 4** para los fondos abstractos de espacio negativo, y **Sharp** ensambla el SVG (glassmorphism/tarjeta elegante) con el logo del cliente.
4. **Respuesta**: Telegram recibe el texto con las ideas o las imágenes finales del carrusel.

## ⚙️ Variables de Entorno y Configuración

El sistema requiere las siguientes variables de entorno para funcionar. En producción de Firebase Functions, se configuran vía `.env`:

```env
# Google Cloud AI (Para Gemini e Imagen)
GEMINI_API_KEY=your_gemini_api_key

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_WEBHOOK_SECRET=secret_string_for_webhook_validation
TELEGRAM_BOT_USERNAME=tu_bot_name

# Integraciones de Google (Próxima Etapa)
GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_DRIVE_FOLDER_ID=PENDIENTE
GOOGLE_CLIENT_EMAIL=PENDIENTE
GOOGLE_PRIVATE_KEY=PENDIENTE

# Meta Graph API (Próxima etapa)
META_LONG_LIVED_TOKEN=PENDIENTE
```

## 🚀 Despliegue (Deploy)

Para subir cualquier cambio al código fuente, se utiliza Firebase CLI:

```bash
# Compilar TypeScript
cd functions
npm run build

# Desplegar las funciones a Google Cloud
firebase deploy --only functions
```

## 🏢 Cómo dar de alta un nuevo cliente (Tenant)

La arquitectura es "Multi-tenant". Para configurar un nuevo cliente, se debe crear un documento en la colección `marcas` de Firestore con el `id_marca` siendo igual a su `telegram_chat_id` para enrutar el bot automáticamente.

## 🗺️ Roadmap (Próximos Pasos)

1. **[PENDIENTE] Integración Google Docs / Drive**: El bot podrá crear automáticamente un documento de Google Docs ordenado en una carpeta específica de Drive cuando se apruebe una de las ideas/guiones generados en la fase de Ideación.
2. **[PENDIENTE] Publicador Instagram API**: Función que inyecte automáticamente el carrusel en la cuenta de Instagram usando Meta Graph API.
3. **[PAUSADO] Dashboard Admin Visual**: Un formulario web integrado en el dashboard del cliente para dar de alta nuevas empresas fácilmente sin tocar la base de datos (Pausado a favor de pulir el core).

---
*Diseñado bajo la filosofía: Orden y Firmeza.*
