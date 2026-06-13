# Bug Fixes y Estado Actual - 12 Jun 2026

## ¿Qué fallaba al generar la semana?
Revisé los logs y era **exactamente el mismo problema** que tuvimos con el carrusel espontáneo: la falta de datos en la base de datos (faltaba el `rubro` en la marca *Estudio Precinto*). 

Antes corregí ese error en la función `generarContenidoEspontaneo.ts`, pero no me di cuenta de que la función del menú semanal (`generarContenidoEstrategico.ts`) **también intentaba leer el rubro** de forma obligatoria para enviárselo a la IA. 

Como no existía el dato, el servidor se colgaba con un error (`TypeError: Cannot read properties of undefined (reading 'rubro')`).

## ¿Qué se solucionó hoy?
1. **El Test de Plantillas:** Telegram guardaba la imagen vieja en caché porque siempre le mandábamos el mismo nombre de archivo (`plantilla_1.jpg`). Le agregué un código de tiempo (`plantilla_1_1718163532.jpg`) para que siempre cargue el diseño nuevo.
2. **Generación de Carrusel (Error de Rubro):** Se modificó la función de contenido espontáneo para que, si el cliente no tiene el rubro cargado en la DB, use "General" por defecto y no rompa el sistema.
3. **Generación del Menú Semanal (Error de Índices de Base de Datos):** Firebase pedía un Índice Compuesto que tardaba en crearse. Se reescribió la consulta de base de datos para saltarse esa restricción y ordenar las ideas localmente de forma ultra-rápida.
4. **Generación del Menú Semanal (Error de Rubro):** Acabo de modificar `generarContenidoEstrategico.ts` para que también utilice "General" por defecto si la marca no tiene rubro.

## Próximos pasos (Mañana)
- El despliegue de esta última corrección ya se está haciendo y va a terminar en breve.
- Mañana simplemente vuelve a pedirle el menú semanal en Telegram y deberías obtener las 5 ideas de forma inmediata.
- Si por casualidad surge un nuevo error, solo dime "revisa los logs" y lo rastreamos, pero con estos blindajes el sistema ya soporta bases de datos incompletas.

¡Que descanses!
