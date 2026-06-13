# SaaS de Generación de Contenido - Documentación del Sistema

Este documento resume la arquitectura, las decisiones técnicas, los flujos principales del sistema y las recientes auditorías de seguridad implementadas para automatizar la creación de contenido en redes sociales mediante Inteligencia Artificial.

---

## 🏗️ Arquitectura General

El sistema está dividido en dos partes principales:
1. **Dashboard Web (Frontend):** Construido en React. Es el panel de control administrativo donde se gestionan los clientes (Marcas), se asignan configuraciones de "Tono de Voz", "Público Objetivo", se gestiona el PIN de seguridad y se administran las plantillas visuales.
2. **Backend (Firebase Cloud Functions):** Escrito en TypeScript. Se encarga de procesar los mensajes de Telegram, comunicarse con la API de Gemini (IA), renderizar imágenes con Puppeteer, subir archivos a Firebase Storage y registrar datos en Firestore y Google Sheets.

---

## 🔒 1. Seguridad y Autenticación (Última Auditoría)

El sistema cuenta con múltiples capas de seguridad implementadas recientemente para proteger contra vectores de ataque como Account Takeovers, Spam, Inyecciones y accesos no autorizados.

- **Vinculación con PIN (Telegram):** El comando `/vincular` ahora requiere un PIN dinámico configurado desde el Dashboard (`/vincular <id_marca> <PIN>`). Esto previene el *Account Takeover* y asegura que solo usuarios autorizados puedan conectar un chat a una marca.
- **Rate Limiting:** El webhook de Telegram cuenta con limitación de solicitudes (Rate Limiting) basado en el ID de Chat, previniendo abusos de tipo *Spam* y sobreconsumo de cuota en Google Cloud y Gemini.
- **Protección contra Prompt Injection:** El input del usuario en Telegram se inyecta en la IA delimitado por etiquetas XML estrictas (`<input_usuario>`), mitigando intentos de secuestro de las directrices del sistema por parte de clientes maliciosos.
- **Bloqueo SSRF y Arbitrary File Read:** El generador de imágenes con Puppeteer desactiva la ejecución de Javascript (`javascriptEnabled: false`) y cuenta con una estricta política de validación de URLs y CSP (Content Security Policy). Los enlaces de Google Docs se evaden explícitamente para no renderizar contenido arbitrario ni revelar IPs del servidor.
- **Reglas de Base de Datos Estrictas:** Tanto `firestore.rules` como `storage.rules` están configuradas en `false` por defecto, permitiendo lectura/escritura **exclusivamente al backend** a través de la cuenta de servicio de Admin SDK. Ningún usuario público puede consultar o sobreescribir datos en Firebase.

---

## 🎨 2. Sistema de Plantillas Gráficas (Custom Templates)

Hemos evolucionado el motor gráfico para que los diseños sean **100% personalizados por cliente** y no dependan de una estructura fija.

- **Diseño Granular:** Se eliminó la configuración global de colores en la base de datos. Ahora, **cada cliente tiene su propio paquete de plantillas HTML**. Los colores, degradados y tipografías se inyectan directamente (hardcodeados) en el código CSS de las plantillas. Esto permite que un cliente tenga un fondo oscuro en una variante y un fondo claro en otra.
- **Gestor en el Dashboard:** En el panel web, el módulo `TemplateManager` permite visualizar, importar archivos `.html` completos y borrar todas las plantillas.
- **Renderizado Seguro (Puppeteer):** Cuando la IA define qué texto va en el gráfico, el backend selecciona una plantilla, la hidrata con los datos de forma segura (sin inyección JS) y toma una captura de pantalla guardando el resultado en Storage.

---

## 🤖 3. Ingesta y Webhook de Telegram (`ingestaEntradaEspontanea`)

El cliente interactúa casi exclusivamente a través de un Bot de Telegram. Todo mensaje que envía impacta en el webhook del backend.

- **Freno de Seguridad y Autenticación Temprana:** Si el usuario no está vinculado, o si un cliente pide generar contenido y **tiene 0 plantillas cargadas**, el bot detiene el proceso instantáneamente. No consume tokens de IA ni satura el servidor.
- **Voz a Texto:** El bot utiliza la capacidad multimodal de Gemini para transcribir notas de audio, extraer la idea central y enviarla a la cola de generación.
- **Comandos de Prueba:** Los comandos `/test` y `/test_plantillas` permiten verificar de manera forzada el pipeline visual de un cliente sin afectar la grilla de publicaciones oficiales.

---

## 🧠 4. IA, Memoria Anti-Repetición y Google Sheets

Una vez que la idea entra a la cola, el worker (`generarContenidoEstrategico`) se encarga del trabajo pesado.

- **Memoria Anti-Repeticiones:** Antes de que la IA escriba el post, el backend consulta en Firestore los últimos 5 posteos generados. Esto sirve como "contexto histórico" para que la IA **no repita ganchos, formatos ni enfoques**.
- **Bloqueo Optimista de Días (Sheets):** El worker "reserva" un día en Google Sheets insertando una fila con estado "PROCESANDO" para evitar colisiones de asignación de días.
- **Formato Adaptable:** La IA es capaz de determinar automáticamente si la idea sirve mejor para un *Carrusel*, una *Imagen* fija o un guión para *Reel (Teleprompter)*.

---

## 🎯 5. Alta de Clientes (Dashboard)

Para un onboarding correcto, en el Dashboard se completan campos vitales para el Prompt de IA:

- **Propuesta de Valor:** Contexto detallado de negocio.
- **Tono de Voz:** Atributos emocionales y de estilo (ej. formal, callejero).
- **Pilares de Contenido:** Ejes temáticos (Educación, Inspiración, Venta, etc.).
- **Credenciales y PIN:** Identificadores de Sheets, Docs, Drive y PIN para la vinculación oficial en Telegram.

---

## 📝 Resumen del Flujo Completo

1. El administrador da de alta la PyME y el PIN en el Dashboard, subiendo plantillas gráficas HTML personalizadas.
2. El cliente vincula su cuenta en Telegram usando `/vincular [marca] [PIN]`.
3. El cliente manda un texto o audio con una idea suelta.
4. El webhook valida sesión, permisos y rate limits. Pasa el mensaje a la cola de procesamiento.
5. El worker elabora el copy, asegura no repetir tópicos recientes, detecta si es Carrusel/Reel/Post y "reserva" el espacio en Sheets.
6. El worker gráfico estampa el texto en las plantillas y genera PNGs.
7. El post final queda alojado en Firebase y registrado en Sheets para su posterior publicación.
