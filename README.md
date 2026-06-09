# SaaS de Estrategias y Contenido Automatizado

Este proyecto es un Agente Autónomo diseñado para generar, gestionar y publicar contenido automatizado para múltiples marcas o clientes, integrando Inteligencia Artificial (Gemini), bases de datos (Firebase Firestore), y una interfaz conversacional (Bot de Telegram).

## Estado Actual (Versión 1.1)

El sistema cuenta con la siguiente arquitectura básica en Firebase Cloud Functions y un Dashboard en React:

1. **Ingesta de Entradas Espontáneas (`ingestaEntradaEspontanea`)**:
   - Escucha mensajes de Telegram.
   - Clasifica la intención del usuario.
   - Guarda el "pensamiento" o nota de audio procesada en la base de datos para su posterior uso.

2. **Generación de Contenido Espontáneo (`generarContenidoEspontaneo`)**:
   - Toma las notas espontáneas del usuario.
   - Usa Google Gemini para redactar contenido profundo, carruseles de Instagram, y un guion para formato corto (Reels/TikToks).
   - Genera automáticamente un **Carrusel Gráfico de variantes premium** que rotan según la identidad visual (paleta de colores) configurada para el usuario.
   - Envía los gráficos renderizados de vuelta a Telegram y también la propuesta de guion y texto.

3. **Dashboard de Administración (React + Vite + Tailwind)**:
   - **Gestión Multi-Tenant**: Alta, baja y edición de clientes (PyMEs). Se pueden configurar sus variables dinámicas (Logo, Colores de marca, Prompt Base).
   - **Gestor de Paquetes de Plantillas**: Sistema escalable que permite crear "Paquetes" de HTML puro con placeholders (`{{COLOR_PRIMARIO}}`, `{{TEXTO}}`, etc). A cada cliente se le pueden habilitar múltiples paquetes que el bot gráfico tomará de manera aleatoria.

## Estética y Plantillas
El sistema de generación de imágenes incluye un motor Puppeteer con plantillas dinámicas que combinan de forma premium los colores de marca de los clientes. 

## Próximos Pasos (Roadmap)
- [ ] Módulo de auto-publicación nativo (Instagram/TikTok).
- [ ] Módulo de sincronización para videos grabados por el usuario.
- [ ] Configurar pasarela de pagos / cobros escalables según cantidad de paquetes gráficos.
