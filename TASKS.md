# Lista de Tareas Pendientes (TODO)

Este archivo sirve para retomar el desarrollo desde otra PC.

## Tareas Pendientes
- [ ] **Probar Carruceles Dinámicos:** Verificar en producción si Puppeteer + Sparticuz están capturando correctamente el HTML generado por Gemini.
- [ ] **Refinar Prompts de Diseño (Opcional):** Si el diseño de Gemini es muy aleatorio, acotar el prompt en `generarContenidoEspontaneo.ts` para que siempre respete un grid específico o layouts predefinidos, dándole menos libertad absoluta y más componentes de "Design System".
- [ ] **Verificar creación de Índice de Firestore:** Confirmar que se creó el índice compuesto para la colección `planificador_contenido` que permite ordenar por `estado` y `fecha_hora_sugerida` para que funcione la función `publicadorContenidoInstagram`.
- [ ] **Mejorar Manejo de Errores en Webhook:** Añadir logs detallados si `marcasSnap.empty` es true, para evitar que el bot no responda si un usuario no registrado o un Chat ID incorrecto le habla al bot.
- [ ] **Pruebas de Publicación:** Testear que la función cron `publicadorContenidoInstagram` envíe exitosamente las imágenes generadas por el carrusel a la API Graph de Instagram.
