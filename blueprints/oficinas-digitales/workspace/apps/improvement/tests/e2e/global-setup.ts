// Playwright no autocarga .env* como Next.js (que sí lo hace para el servidor que arranca su propio
// webServer) — el proceso de test en sí (donde corre a11y.spec.ts, que importa @jotapuntoce/db
// directo para sembrar datos) nunca ve DATABASE_URL sin esto. Corre antes de que Playwright cargue
// cualquier archivo de spec (los imports estáticos de esos archivos ya necesitan el env listo).
export default async function globalSetup() {
  try {
    process.loadEnvFile(".env.test");
  } catch {
    // .env.test no presente — se asume que el entorno (CI) ya exportó las variables necesarias.
  }

  // SUPABASE_SERVICE_ROLE_KEY vive solo en el .env.local de la raíz, nunca en un .env de
  // apps/improvement (Non-negotiable #3) — @jotapuntoce/db/test-fixtures la necesita para crear el
  // usuario de prueba de a11y.spec.ts, y no carga ningún .env por sí mismo (ver testFixtures.ts).
  try {
    process.loadEnvFile("../../.env.local");
  } catch {
    // Igual: se asume que CI ya exportó las variables necesarias.
  }
}
