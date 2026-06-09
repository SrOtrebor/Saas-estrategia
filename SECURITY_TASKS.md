# 🔐 Plan de Tareas de Seguridad — SaaS Estrategias

## 🔴 CRÍTICO — Hacer HOY antes de agregar más clientes

- [x] **[CRIT-01] Revocar la clave del Admin SDK de Firebase**
  - Ir a Google Cloud Console → IAM → Service Accounts
  - Encontrar `firebase-adminsdk-fbsvc@saas-estrategias.iam.gserviceaccount.com`
  - Eliminar la clave `5a88c4b7c1...` y generar una nueva
  - Eliminar el archivo `saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json` del directorio

- [x] **[CRIT-02] Agregar autenticación al Dashboard**
  - Crear componente `PrivateRoute.tsx`
  - Crear página `Login.tsx` con email/contraseña usando Firebase Auth
  - Envolver las rutas `/admin` y `/templates` con el `PrivateRoute`
  - Crear el usuario admin en Firebase Auth Console
  - Hacer deploy del dashboard

## 🟠 ALTO — Hacer esta semana

- [x] **[HIGH-01] Asegurar las reglas de Firestore**
  - Reescribir `firestore.rules`: solo permitir lectura/escritura a usuarios autenticados

- [x] **[HIGH-01b] Asegurar las reglas de Storage**
  - Permitir lectura pública solo de `posts/`
  - Escritura solo para usuarios autenticados o Cloud Functions

- [x] **[HIGH-02] Hacer la validación del Webhook obligatoria**
  - Si no hay `TELEGRAM_WEBHOOK_SECRET` configurado → rechazar con 500, no aceptar todo

- [x] **[HIGH-03] Sandboxear el HTML de Puppeteer**
  - Deshabilitar JS en Puppeteer: `page.setJavaScriptEnabled(false)`
  - Agregar CSP header antes de setContent

## 🟡 MEDIO — Esta semana / próxima

- [x] **[MED-01]** Reducir logging del webhook (no logear el payload completo de Telegram)
- [ ] **[MED-02]** Mover `token_meta` de Firestore a Google Secret Manager
- [ ] **[MED-03]** Validar explícitamente todas las variables de entorno al inicio de cada función

## 🟢 BAJA PRIORIDAD — Backlog

- [x] **[LOW-01]** Unificar los dos archivos de configuración de Firebase en el Dashboard
- [x] **[LOW-02]** Validar tamaño máximo de plantillas HTML (límite: 500KB)

## Checklist Final

- [x] No quedan archivos `.json` de credenciales en el repositorio
- [x] El Dashboard redirige a `/login` sin sesión activa
- [x] Reglas de Firestore y Storage en modo restrictivo (deployed)
- [x] Webhook rechaza requests sin el header correcto
- [x] Puppeteer no ejecuta JavaScript de plantillas externas
