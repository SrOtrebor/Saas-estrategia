# SaaS de Estrategias y Contenido Automatizado

Este proyecto es un Agente Autónomo diseñado para generar, gestionar y publicar contenido automatizado para múltiples marcas o clientes, integrando Inteligencia Artificial (Gemini), bases de datos (Firebase Firestore), y una interfaz conversacional (Bot de Telegram).

## Estado Actual (Versión 1.0)

Actualmente, el sistema cuenta con la siguiente arquitectura básica en Firebase Cloud Functions:

1. **Ingesta de Entradas Espontáneas (`ingestaEntradaEspontanea`)**:
   - Escucha mensajes de Telegram.
   - Clasifica la intención del usuario.
   - Guarda el "pensamiento" o nota de audio procesada en la base de datos para su posterior uso.

2. **Generación de Contenido Espontáneo (`generarContenidoEspontaneo`)**:
   - Toma las notas espontáneas del usuario.
   - Usa Google Gemini para redactar contenido profundo, carruseles de Instagram, y un guion para formato corto (Reels/TikToks).
   - Genera automáticamente un **Carrusel Gráfico de 8 variantes premium** que rotan según la identidad visual (paleta de colores) configurada para el usuario.
   - Envía los gráficos renderizados de vuelta a Telegram y también la propuesta de guion y texto.

3. **(En Desarrollo) Generación de Documentos y Grilla Semanal**:
   - Creación en Google Docs estructurado.
   - Llenado de calendarios en Google Sheets.

## Estética y Plantillas
El sistema de generación de imágenes incluye un motor SVG-a-PNG con **8 plantillas de diseño exclusivas** que combinan de forma premium los colores de marca de los clientes. Se usan variantes Minimalistas, Brutalistas, Degradados y diseños geométricos avanzados.

## Flujos Pendientes y Próximos Pasos
- Corrección de exportación a Google Docs (estructura y guardado en carpetas).
- Módulo de auto-publicación nativo (Instagram/TikTok).
- Módulo de sincronización para videos grabados por el usuario.
- Dashboard Frontend para configuración Multi-Tenant (crear clientes, personalizar colores, logos, prompts y estilos visuales).
