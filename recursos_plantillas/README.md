# Sistema de Plantillas - Guía para Agentes (IA)

Este directorio contiene los archivos necesarios para gestionar, previsualizar y cargar plantillas de diseño al sistema SaaS.

## Archivos Principales

1. **`plantillas_a_cargar.html`**: Este es el archivo "en crudo" que se sube al Dashboard web del cliente. Contiene múltiples variantes de diseño HTML separadas entre sí por líneas en blanco (`\n\n`).
2. **`muestrario_plantillas.html`**: Esta es una herramienta interactiva local para previsualizar las plantillas. Contiene las mismas plantillas embebidas en un array de JavaScript y las renderiza usando iframes escalados para que puedas ver cómo lucen sin tener que cargarlas al sistema.

---

## 🛠️ Cómo funciona el motor gráfico (Puppeteer)

Cuando el sistema genera un posteo, el backend (Node.js) selecciona una plantilla al azar de las que el cliente tiene guardadas en su base de datos (Firestore). Luego realiza un reemplazo de texto simple:

*   Reemplaza la variable **`{{TEXTO}}`** con el contenido generado por la IA (títulos, párrafos, viñetas, o código HTML estructurado con clases).
*   Reemplaza la variable **`{{LOGO_URL}}`** con la URL pública del logo del cliente.

Luego, el backend inyecta este HTML resultante en una instancia de **Puppeteer** (navegador headless) con un viewport fijado estrictamente en **1080x1080 píxeles** y le toma una captura de pantalla (screenshot) en formato PNG/WebP.

---

## 🎨 Creación y Edición de Plantillas

Si el usuario te pide crear o modificar una plantilla, **sigue estrictamente estas reglas**:

### 1. Variables Obligatorias
El HTML **debe** contener las variables exactas (en mayúsculas y con llaves dobles). No uses template literals de JS (`${}`) en el archivo a cargar.
*   `{{TEXTO}}` - Ubicado dentro del contenedor principal (ej: `<div class="content-wrapper">{{TEXTO}}</div>`).
*   `{{LOGO_URL}}` - En la etiqueta de imagen (ej: `<img src="{{LOGO_URL}}" class="logo">`).

### 2. Estructura y Dimensiones
*   El tag `body` **debe** estar forzado a `width: 1080px; height: 1080px; margin: 0; overflow: hidden;`.
*   Usa `box-sizing: border-box;` en todo.
*   Todo el CSS debe ir en la etiqueta `<style>` dentro del `<head>` del propio documento.
*   **No se deben incluir llamadas a imágenes externas** (excepto Google Fonts y el logo), ya que ralentizan el renderizado o pueden fallar.
*   Todo el HTML de una variante (incluyendo doctype, head, style, body) **debe estar en un solo bloque contiguo**.

### 3. Colores (CSS Duro)
A diferencia de versiones anteriores del sistema, **los colores no se inyectan como variables `{{COLOR...}}`**. 
Los códigos HEX de la paleta del cliente (ej: `#a28a68`, `#0e132b`, etc.) **deben estar hardcodeados directamente en el CSS de la plantilla**. Esto permite que cada variante pueda invertir los colores, cambiar degradados o tener fondos distintos sin estar limitados a una paleta fija.

### 4. Prueba y Previsualización
Antes de entregar un diseño al usuario:
1. Agrégalo al array `plantillas` dentro de `muestrario_plantillas.html`.
2. Ábrelo en el navegador local y verifica que no se desborde, que la alineación sea correcta y que los contrastes de color sean legibles.
3. Si el diseño es aprobado, expórtalo (sin variables de JS, solo `{{TEXTO}}` y `{{LOGO_URL}}`) y guárdalo en `plantillas_a_cargar.html` separado por un doble salto de línea.

---

**Nota para el Agente:** Siempre que vayas a tocar el diseño gráfico, asegúrate de mantener la coherencia estética (Aesthetics) y un look moderno, premium y minimalista, utilizando las tipografías de Google Fonts (ej: Montserrat, Inter) que ya vienen configuradas en los estilos base.
