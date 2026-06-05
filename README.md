# 🚀 SaaS Estrategias — Content AI Pipeline

Plataforma de automatización y generación de contenido impulsada por IA, construida para **Estudio Precinto**. 
El sistema permite que un operador envíe una nota de voz o mensaje de texto a través de Telegram, y en segundos, la IA procesa ese input para generar un carrusel de Instagram completo (Copy, Hashtags y Diseño Gráfico) aplicando la identidad visual, el logo y el tono de comunicación de la marca del cliente.

## 🏗️ Arquitectura y Tecnologías

El backend está construido de manera 100% serverless sobre **Firebase (Node.js 22)**:

- **Orquestador**: Firebase Cloud Functions (`generarContenidoEspontaneo`)
- **Base de Datos**: Firestore (colecciones: `marcas`, `cola_ingesta`, `planificador_contenido`)
- **Motor de Texto (Copywriting)**: Gemini 2.5 Flash
- **Motor de Imágenes (Fondos)**: Google Imagen 4 Fast
- **Motor Gráfico (Composición)**: Sharp (Node.js) + SVG Overlay dinámico
- **Almacenamiento**: Firebase Storage (alberga logos y assets renderizados)
- **Notificaciones e Input**: API de Telegram Bot (Webhooks)
- **Histórico (Base de datos relacional/cliente)**: Google Sheets API

## 🔄 Flujo de Datos del Pipeline

1. **Telegram Webhook (`ingestaEntradaEspontanea`)**: Recibe mensajes del operador y los guarda en la colección `cola_ingesta` de Firestore indicando a qué marca pertenece.
2. **Disparador Firestore (`generarContenidoEspontaneo`)**: Escucha los nuevos documentos en `cola_ingesta` e inicia el pipeline:
   - Extrae los datos de la marca (`identidad_visual`, `comunicacion`).
   - Envía el input del usuario a **Gemini 2.5 Flash** con un system prompt estructurado para generar copy, hashtags y textos cortos.
   - Envía prompts a **Imagen 4** para generar fondos oscuros/profesionales de oficinas o infraestructura tecnológica sin texto.
   - Pasa las imágenes por **Sharp**, superponiendo un SVG que contiene el texto de cada slide, un gradiente oscuro, la barra de progreso, y el **logo del cliente**.
   - Sube los resultados a **Firebase Storage**.
   - Guarda el resultado consolidado en la colección `planificador_contenido`.
   - Registra una nueva fila en el **Google Sheets** histórico del cliente.
   - Notifica por **Telegram** al operador con el carrusel y copy listos para revisar.

## ⚙️ Variables de Entorno y Configuración

El sistema requiere las siguientes variables de entorno para funcionar. En producción de Firebase Functions, se configuran vía `.env`:

```env
# Google Cloud AI (Para Gemini e Imagen)
GEMINI_API_KEY=your_gemini_api_key

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_WEBHOOK_SECRET=secret_string_for_webhook_validation
TELEGRAM_BOT_USERNAME=tu_bot_name

# Google Sheets
GOOGLE_SHEETS_ID=your_spreadsheet_id

# Meta Graph API (Próxima etapa)
META_LONG_LIVED_TOKEN=PENDIENTE
```

## 🚀 Despliegue (Deploy)

Para subir cualquier cambio al código fuente, se utiliza Firebase CLI:

```bash
# Compilar TypeScript
cd functions
npm run build

# Desplegar la función principal a Google Cloud
firebase deploy --only "functions:generarContenidoEspontaneo"
firebase deploy --only "functions:ingestaEntradaEspontanea"
```

> **Aclaración sobre Permisos**: La función `ingestaEntradaEspontanea` (el webhook de Telegram) necesita permisos públicos en Google Cloud IAM para poder recibir los POST requests de Telegram. El rol necesario es `Cloud Functions Invoker` para el principal `allUsers`.

## 🏢 Cómo dar de alta un nuevo cliente (Tenant)

La arquitectura es "Multi-tenant". Para configurar un nuevo cliente, se debe crear un documento en la colección `marcas` de Firestore con el `id_marca`.

**Ejemplo de estructura de marca:**
```json
{
  "nombre_comercial": "Estudio Precinto",
  "datos_negocio": {
    "rubro": "Consultoría operativa y software a medida",
    "publico_objetivo": "Dueños de negocios...",
    "propuesta_valor": "Mapea y elimina agujeros negros operativos..."
  },
  "comunicacion": {
    "tono_de_voz": "Directo, ingeniería, Orden y firmeza.",
    "pilares_contenido": ["Casos de éxito", "Educación", "Filosofía"]
  },
  "identidad_visual": {
    "color_primario_hex": "#0E132B",
    "color_secundario_hex": "#39506B",
    "logo_url": "https://storage.googleapis.com/.../logofull.svg"
  },
  "credenciales_redes": {
    "telegram_chat_id": "677028989"
  }
}
```

## 🗺️ Roadmap (Próximos Pasos)

1. **[PENDIENTE] PWA Tinder de Aprobación**: Interfaz web mobile-first donde el cliente puede hacer "swipe" (deslizar) para Aprobar o Rechazar el contenido generado.
2. **[PENDIENTE] Publicador Instagram API**: Función que, al aprobar un posteo en la PWA, inyecte automáticamente el carrusel en la cuenta de Instagram usando Meta Graph API.
3. **[PENDIENTE] Hardening de Producción**: Alertas de Cloud Monitoring, Secrets Manager, y Reglas de Seguridad en Firestore/Storage.

---
*Diseñado bajo la filosofía: Orden y Firmeza.*
