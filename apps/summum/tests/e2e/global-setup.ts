// Playwright no autocarga .env* en el proceso de test (solo Next.js lo hace en su servidor). El spec
// importa @jotapuntoce/db directo, así que necesita DATABASE_URL y SUPABASE_SERVICE_ROLE_KEY aquí.
// Mismo patrón que apps/improvement/tests/e2e/global-setup.ts.
export default async function globalSetup() {
  for (const f of [".env.test", ".env.local", "../../.env.local"]) {
    try {
      process.loadEnvFile(f);
    } catch {
      // Archivo ausente — se asume que CI ya exportó las variables necesarias.
    }
  }
}
