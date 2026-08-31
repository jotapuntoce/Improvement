// Mismo patrón que apps/improvement/tests/setup.ts — carga .env.test antes de que cualquier test
// importe @jotapuntoce/db (que lee DATABASE_URL en el top-level del módulo). Sin esto, admin no
// tenía forma de correr sus propios tests contra la base real — vitest no auto-carga .env como Next.
try {
  process.loadEnvFile(".env.test");
} catch {
  // .env.test no presente — se asume que el entorno (CI) ya exportó las variables necesarias.
}
