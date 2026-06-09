# 🔐 Auditoría de Seguridad — SaaS Estrategias
**Fecha:** 2026-06-09 | **Auditor:** Agente IA — Rol: Cybersecurity Senior

---

> [!CAUTION]
> Se detectaron **2 vulnerabilidades CRÍTICAS** que deben corregirse INMEDIATAMENTE antes de seguir creciendo con más clientes.

---

## Resumen Ejecutivo

| Severidad | Cantidad | Estado |
|-----------|----------|--------|
| 🔴 CRÍTICA | 2 | Acción inmediata requerida |
| 🟠 ALTA | 3 | Corregir esta semana |
| 🟡 MEDIA | 3 | Planificar en el corto plazo |
| 🟢 BAJA | 2 | Mejoras opcionales |

---

## 🔴 VULNERABILIDADES CRÍTICAS

### [CRIT-01] Clave privada del Admin SDK de Firebase expuesta en Git

**Archivo:** `saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json`

**Descripción:**  
El archivo JSON de credenciales del Admin SDK está en el repositorio y fue subido a GitHub público. Contiene la `private_key` RSA completa.

**Impacto:**  
Acceso total de administrador a toda la base de datos Firestore, Storage y usuarios de cualquier persona que tenga el repo.

**Solución inmediata:**
1. Ir a Google Cloud Console → IAM → Service Accounts
2. Revocar/eliminar la clave `5a88c4b7c1...`
3. Generar una clave nueva y usarla SOLO localmente
4. Borrar el archivo del directorio y verificar el .gitignore

> [!WARNING]
> Agregar al `.gitignore` DESPUÉS de subir NO elimina del historial. Es obligatorio revocar la clave.

---

### [CRIT-02] Dashboard de administración completamente público (sin autenticación)

**Archivo:** `dashboard/src/App.tsx`

```tsx
// Ninguna ruta está protegida
<Route path="/admin" element={<AdminDashboard />} />
<Route path="/templates" element={<TemplateManager />} />
```

**Impacto:** Cualquier persona que sepa la URL tiene acceso total a datos de todos los clientes.

---

## 🟠 VULNERABILIDADES ALTAS

### [HIGH-01] Reglas de Firestore y Storage completamente abiertas

```js
// firestore.rules — PELIGROSO
allow read, write: if true; // ← Acceso total sin autenticación
```

Toda la base de datos y storage son accesibles desde internet sin login.

---

### [HIGH-02] Validación del Webhook de Telegram condicional

```ts
// Si TELEGRAM_WEBHOOK_SECRET no está configurada → acepta todo
if (secretToken && headerToken !== secretToken) { ... }
```
Debería fallar si no hay secret, no aceptar todo.

---

### [HIGH-03] HTML de plantillas inyectado en Puppeteer sin sanitización

```ts
// HTML de Firestore (cargado por cualquier admin) ejecutado en Chromium
await page.setContent(htmlPlaca, { waitUntil: "networkidle0" });
```
Un HTML malicioso podría hacer SSRF o robar tokens del entorno de Cloud Functions.

---

## 🟡 VULNERABILIDADES MEDIAS

### [MED-01] Logging del payload completo de Telegram en producción
```ts
functions.logger.info("[ingesta] Payload recibido:", JSON.stringify(update));
```
Se loguea el mensaje completo, chat_id, nombre del usuario. Datos innecesarios expuestos en logs.

### [MED-02] `token_meta` de Instagram en texto plano en Firestore
El token de Meta/Instagram está almacenado sin cifrar. Si Firestore es comprometido, el atacante puede publicar en Instagram de todos los clientes.

### [MED-03] Variables de entorno usadas con `!` sin verificación
```ts
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
```
Si la variable no existe en producción, falla silenciosamente o expone stack traces.

---

## 🟢 MEJORAS DE BAJA PRIORIDAD

- **[LOW-01]** Doble archivo de config Firebase en el Dashboard (`firebase.ts` y `lib/firebase.ts`)
- **[LOW-02]** Sin límite de tamaño en plantillas HTML subidas por clientes

---

## 📋 Tabla de Estado General

| Práctica | Estado |
|----------|--------|
| Variables de entorno para secrets | ✅ Correcto |
| Autenticación del Dashboard | ❌ Ausente |
| Reglas de Firestore restrictivas | ❌ Todo público |
| Reglas de Storage restrictivas | ❌ Todo público |
| Sanitización de HTML externo | ❌ Ausente |
| Validación del webhook Telegram | ⚠️ Condicional |
| Logging de datos sensibles | ⚠️ Excesivo |
| Secretos en el repositorio Git | ❌ CRÍTICO |
| Rate Limiting en endpoints | ❌ Ausente |
