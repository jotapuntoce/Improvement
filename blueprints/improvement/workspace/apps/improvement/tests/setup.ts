// Carga .env.test para las pruebas de integración que hablan con el proyecto Supabase real de
// desarrollo (ver blueprint.md §10, restricción de entorno — sin Docker local confirmado). Usa la
// API nativa de Node 24 en vez de una dependencia como `dotenv` (blueprint §11, Deliberately not
// used). El try/catch es intencional: en CI las variables ya vienen exportadas por la plataforma,
// no desde un archivo, así que la ausencia de .env.test ahí no debe fallar la suite.
try {
  process.loadEnvFile(".env.test");
} catch {
  // .env.test no presente — se asume que el entorno (CI) ya exportó las variables necesarias.
}
