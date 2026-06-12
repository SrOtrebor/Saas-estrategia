# SaaS de Generación de Contenido - Documentación del Sistema

Este documento resume la arquitectura, las decisiones técnicas y los flujos principales del sistema que hemos construido para automatizar la creación de contenido en redes sociales mediante Inteligencia Artificial.

---

## 🏗️ Arquitectura General

El sistema está dividido en dos partes principales:
1. **Dashboard Web (Frontend):** Construido en React. Es el panel de control administrativo donde se gestionan los clientes (Marcas), se asignan configuraciones de "Tono de Voz", "Público Objetivo" y se administran las plantillas visuales.
2. **Backend (Firebase Cloud Functions):** Escrito en TypeScript. Se encarga de procesar los mensajes de Telegram, comunicarse con la API de Gemini (IA), renderizar imágenes con Puppeteer, subir archivos a Firebase Storage y registrar datos en Firestore y Google Sheets.

---

## 🎨 1. Sistema de Plantillas Gráficas (Custom Templates)

Hemos evolucionado el motor gráfico para que los diseños sean **100% personalizados por cliente** y no dependan de una estructura fija.

- **Diseño Granular:** Se eliminó la configuración global de colores en la base de datos. Ahora, **cada cliente tiene su propio paquete de plantillas HTML**. Los colores, degradados y tipografías se inyectan directamente (hardcodeados) en el código CSS de las plantillas. Esto permite que un cliente tenga un fondo oscuro en una variante y un fondo claro en otra.
- **Gestor en el Dashboard:** En el panel web, agregamos el módulo `TemplateManager`. Permite visualizar, importar archivos `.html` completos y borrar todas las plantillas.
- **Renderizado (Puppeteer):** Cuando la IA define qué texto va en el gráfico, el backend selecciona una de las plantillas HTML del cliente, reemplaza la etiqueta `{{TEXTO}}` por el texto generado, y `{{LOGO_URL}}` por el logo de la marca. Luego, levanta un navegador "invisible" de 1080x1080px, le saca una foto y lo guarda.

---

## 🤖 2. Ingesta y Webhook de Telegram (`ingestaEntradaEspontanea`)

El cliente interactúa casi exclusivamente a través de un Bot de Telegram. Todo mensaje que envía impacta en el webhook del backend.

- **Freno de Seguridad:** Agregamos una validación crítica temprana. Si un cliente envía un mensaje o pide generar un post pero **tiene 0 plantillas cargadas** en el dashboard, el bot detiene el proceso instantáneamente y le devuelve una alerta ("⚠️ Este cliente no tiene plantillas cargadas..."). No consume tokens de IA ni satura el servidor.
- **Voz a Texto:** Si el cliente manda un audio, el bot utiliza la capacidad multimodal de Gemini para transcribir el audio, extraer la idea central y enviarla a la cola de generación.
- **Comandos de Prueba:** Comandos como `/test` y `/test_plantillas` permiten verificar de manera forzada el pipeline visual de un cliente y revisar cómo se ven sus diseños sin afectar su grilla de publicaciones oficiales.

---

## 🧠 3. IA, Memoria Anti-Repetición y Google Sheets (`generarContenidoEstrategico`)

Una vez que la idea entra a la cola, una función en segundo plano se encarga del trabajo pesado usando un prompt muy robusto y estructurado.

- **Memoria Anti-Repeticiones:** Antes de que la IA escriba el post, el backend consulta en Firestore los últimos 5 posteos generados para esa marca. Se los pasamos a la IA como "contexto histórico" para garantizar que **no repita ganchos, formatos ni enfoques** que se usaron recientemente.
- **Bloqueo Optimista de Días (Sheets):** Cuando el contenido se genera exitosamente, calculamos qué día de la semana le toca publicar. En ese instante, insertamos una fila en Google Sheets con estado "PROCESANDO" para "reservar" ese día (ej: Viernes) y evitar que otro posteo generado concurrentemente se asigne al mismo día. Cuando el proceso gráfico termina, se actualiza esa fila con los links de las imágenes finales.
- **Formato Adaptable:** La IA es capaz de determinar si la idea del cliente sirve mejor para un *Carrusel*, una *Imagen* fija o un guión para *Reel (Teleprompter)*. 

---

## 🎯 4. Cómo dar de alta a un Cliente Nuevo (Prompts)

Para que el bot brinde resultados óptimos, en el Dashboard se deben completar los siguientes campos con la mayor granularidad posible:

- **Propuesta de Valor:** "Prendas deportivas seamless, sin costuras, que modelan el cuerpo". (Evitar cosas genéricas como "Ropa deportiva de calidad").
- **Tono de Voz (Reglas de comportamiento):** 
  - *Personalidad:* Cálido, motivador y empático. Hablar de "vos".
  - *Reglas:* Oraciones cortas. Evitar lenguaje corporativo.
  - *Estructura:* Arrancar siempre con un gancho (pregunta) y terminar con un Llamado a la Acción fuerte.
- **Pilares de Contenido:** 1. Educación/Tips. 2. Inspiración/Mindset. 3. Venta Suave (beneficios del producto). 

---

## 📝 Resumen del Flujo Completo

1. El cliente aprueba sus plantillas gráficas (dorado/premium/etc.) a través del Panel Web.
2. El cliente manda un audio a Telegram contando una idea suelta.
3. El webhook frena si no hay plantillas, si las hay, transcribe el audio y lo manda a la cola.
4. El worker lee los últimos posts para no repetir temas, elabora el copywriting perfecto y define un día de publicación (pre-reservando el espacio en Sheets).
5. El worker gráfico (`imageGenerator`) agarra una plantilla HTML aleatoria de ese cliente, estampa el texto y genera las imágenes PNG.
6. El posteo final (textos + imágenes) queda guardado en la base de datos listo para revisión/publicación y actualizado en Google Sheets.
