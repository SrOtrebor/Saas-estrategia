# 🤖 SaaS Estrategias — Agente Autónomo de Contenido para Instagram

Sistema serverless que actúa como **estratega, planificador y generador de contenido automatizado** para Instagram. 100% paramétrico, multimarca y multitenant. Toda la lógica de la IA, identidad visual y canales de distribución se gobiernan desde Firestore — sin tocar una línea de código.

---

## 🏗️ Arquitectura

```
INPUTS                   PROCESAMIENTO                    OUTPUTS
──────                   ─────────────                    ───────
Telegram Bot    ──→      Cloud Function                   Planificador
(texto/voz)              generarContenidoEspontaneo  ──→  en Firestore
                         │
Scheduler       ──→      1. Lee config de marca           Panel de
(Lunes 8am)              2. Gemini 2.5 Flash              Control  ──→  Instagram
                         3. Imagen 4 Fast            ──→  (aprobación)
                         4. Firebase Storage               
                         5. Guarda en Firestore
```

---

## ⚙️ Stack Tecnológico

| Capa | Tecnología | Costo |
|---|---|---|
| **Backend / Compute** | Firebase Cloud Functions (Node.js / TypeScript) | $0 (Blaze, límites gratuitos) |
| **Base de datos** | Firestore | $0 (50k lecturas/día gratis) |
| **Almacenamiento imágenes** | Firebase Storage | $0 (5 GB gratis) |
| **IA — Texto** | Google Gemini 2.5 Flash | $0 (capa gratuita) |
| **IA — Imágenes** | Google Imagen 4 Fast | ~$0.004/imagen |
| **Motor gráfico** | Sharp + SVG | $0 |
| **Mensajería** | Telegram Bot API | $0 |
| **Publicación** | Meta Graph API (Instagram) | $0 |

**Costo mensual estimado para 1 marca (4 posts/semana):** < $0.20 USD

---

## 📁 Estructura del Proyecto

```
SaaS-estrategias/
├── functions/                          # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts                    # Entry point — exporta todas las funciones
│   │   ├── interfaces.ts              # Tipos TypeScript (MarcaConfig, PosteoContenido, etc.)
│   │   ├── functions/
│   │   │   ├── generarContenidoEstrategico.ts  # Función principal de generación
│   │   │   ├── ingestaEntradaEspontanea.ts     # Webhook de Telegram
│   │   │   └── publicadorContenidoInstagram.ts # Publicador en Meta/Instagram
│   │   └── lib/
│   │       ├── gemini.ts              # Cliente Google Gemini 2.5 Flash
│   │       └── imageGenerator.ts     # Motor gráfico Sharp+SVG (fallback sin IA)
│   ├── .env                           # Variables de entorno (NO subir a git)
│   ├── seed.js                        # Script para poblar Firestore con marca demo
│   ├── test-gemini.js                 # Test: generación de texto con Gemini
│   ├── test-imagen.js                 # Test: generación gráfica Sharp+SVG
│   ├── test-imagen-ia.js              # Test: fondos con Google Imagen 4 Fast
│   └── package.json
├── saas-estrategias-firebase-adminsdk-*.json  # Service account (NO subir a git)
└── README.md
```

---

## 🗄️ Colecciones en Firestore

### `/marcas/{id_marca}`
Documento de configuración de cada marca. Controla toda la IA.

```json
{
  "id_marca": "panaderia-demo",
  "nombre_comercial": "Panadería Demo",
  "datos_negocio": {
    "rubro": "Panadería Artesanal",
    "publico_objetivo": "Familias y adultos de 25-50 años...",
    "propuesta_valor": "Pan sin conservantes, amasado a mano..."
  },
  "comunicacion": {
    "tono_de_voz": "Cálido, cercano, español rioplatense...",
    "pilares_contenido": ["Detrás de cámaras", "Producto estrella", "..."],
    "cuentas_referencia": ["@panaderia_referencia"]
  },
  "identidad_visual": {
    "color_primario_hex": "#C8703A",
    "color_secundario_hex": "#F5ECD7",
    "logo_url": "https://...",
    "fuente_titulo": "Georgia"
  },
  "distribucion": {
    "telegram_chat_id": "-1001234567890",
    "instagram_page_id": "...",
    "instagram_access_token": "..."
  }
}
```

### `/cola_ingesta/{id}`
Input espontáneo desde Telegram. Al crearse, dispara la generación inmediata.

### `/planificador_contenido/{id_post}`
Posts generados listos para aprobación y publicación.

---

## 🚀 Setup Inicial

### 1. Requisitos
- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Cuenta de Firebase (proyecto `saas-estrategias`)
- API Key de Google AI Studio (con créditos para Imagen 4)

### 2. Instalar dependencias
```bash
cd functions
npm install
```

### 3. Configurar variables de entorno
Crear `functions/.env` con:
```env
# Google AI Studio (Gemini + Imagen 4)
GEMINI_API_KEY=AQ.Tu_Clave_Aqui

# Telegram Bot
TELEGRAM_BOT_TOKEN=PENDIENTE
TELEGRAM_WEBHOOK_SECRET=PENDIENTE

# Meta / Instagram
META_LONG_LIVED_TOKEN=PENDIENTE

# Firebase
FIREBASE_PROJECT_ID=saas-estrategias
GOOGLE_APPLICATION_CREDENTIALS=../saas-estrategias-firebase-adminsdk-fbsvc-xxxxx.json
```

### 4. Poblar Firestore con marca demo
```bash
cd functions
node seed.js
```

### 5. Probar la IA
```bash
# Test generación de texto (Gemini 2.5 Flash)
node test-gemini.js

# Test motor gráfico (Sharp + SVG, sin IA)
node test-imagen.js

# Test fondos de IA (Google Imagen 4 Fast — requiere créditos)
node test-imagen-ia.js
```

### 6. Compilar TypeScript
```bash
npm run build
```

### 7. Deploy a Firebase
```bash
firebase deploy --only functions
```

---

## 🔧 Variables de Entorno Requeridas

| Variable | Descripción | Estado |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio — Gemini + Imagen | ✅ Configurado |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram | ⏳ Pendiente |
| `TELEGRAM_WEBHOOK_SECRET` | Secret para validar webhooks | ⏳ Pendiente |
| `META_LONG_LIVED_TOKEN` | Token de la Graph API de Meta | ⏳ Pendiente |

---

## 🌊 Flujo de Generación de Contenido

1. **Trigger** → Scheduler semanal (lunes 8am) o ingesta espontánea desde Telegram
2. **Leer marca** → Se obtiene la config completa de `/marcas/{id_marca}` en Firestore
3. **Construir prompt** → Se inyectan todas las variables de la marca en el prompt maestro
4. **Gemini 2.5 Flash** → Genera copy, hashtags, textos de slides, fecha sugerida (JSON)
5. **Imagen 4 Fast** → Genera fondo fotográfico único por slide según el tema del post
6. **Sharp** → Compone la imagen final: fondo IA + overlay de texto + branding de marca
7. **Firebase Storage** → Sube los PNGs finales (1080x1080)
8. **Firestore** → Guarda el post completo en `/planificador_contenido` con estado `PENDIENTE`
9. **Telegram** → Notifica al operador con preview del contenido
10. **Aprobación** → El operador revisa y aprueba (Panel de Control o Telegram)
11. **Instagram** → `publicadorContenidoInstagram` publica via Meta Graph API

---

## 🔒 Seguridad

- Las claves de API están en `.env` (nunca subir al repositorio)
- El service account de Firebase tiene permisos mínimos necesarios
- El webhook de Telegram valida el `X-Telegram-Bot-Api-Secret-Token`
- Reglas de Firestore en modo producción (no test mode) antes del deploy

---

## 📝 Notas de Arquitectura

- **Instagram Stories**: No pueden automatizarse via API. El sistema las enruta a Telegram para aprobación manual.
- **JSON garantizado**: Gemini usa `responseMimeType: "application/json"` para evitar texto adicional.
- **Patrón dual trigger**: `generarGrillaSemanal` (PubSub) + `generarContenidoEspontaneo` (OnCreate Firestore).
- **Motor gráfico fallback**: Si Imagen 4 falla (créditos agotados), `imageGenerator.ts` genera slides con Sharp+SVG.
