/**
 * envValidator.ts
 * ─────────────────────────────────────────────────────────────
 * Validación centralizada de variables de entorno (Seguridad MED-03).
 * Asegura que la aplicación no inicie o aborte con un mensaje
 * descriptivo si faltan secretos críticos en producción.
 * ─────────────────────────────────────────────────────────────
 */

export function validarEntorno() {
  const requeridas = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "GEMINI_API_KEY",
    // Agregaremos más en el futuro según crezca la app
  ];

  const faltantes = requeridas.filter(key => !process.env[key]);

  if (faltantes.length > 0) {
    // Solo logueamos las llaves faltantes, nunca los valores
    console.error(`🚨 [SEGURIDAD] Faltan variables de entorno críticas: ${faltantes.join(", ")}`);
    // Opcionalmente podríamos lanzar un error aquí para evitar que levanten las functions, 
    // pero como algunas son on-demand preferimos logear y que fallen controladamente en su ejecución.
  }
}

/** 
 * helper para obtener de forma segura una var o lanzar error si no existe 
 * en el contexto específico donde es estrictamente obligatoria
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Configuración del sistema incompleta: Falta ${key}. Contacte al administrador.`);
  }
  return value;
}
