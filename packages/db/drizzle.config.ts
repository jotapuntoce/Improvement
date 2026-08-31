import { defineConfig } from "drizzle-kit";

// Herramienta standalone — Next.js no está en el medio, así que nadie más carga .env.local por ti.
// process.loadEnvFile es la API nativa de Node >=21.7 (estable en Node 24, el pin de este monorepo);
// se evita `dotenv` a propósito (blueprint §11, Deliberately not used) para no agregar una
// dependencia que Node ya resuelve. El try/catch es intencional: en CI/Vercel las variables ya
// vienen exportadas por la plataforma, no desde un archivo.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local no presente — se asume que el entorno ya exportó DATABASE_URL_DIRECT.
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Migraciones SIEMPRE contra la conexión directa (puerto 5432) — nunca el pooler transaction-mode
    // (blueprint §10, §19.6; regla en .claude/rules/base-de-datos.md).
    url: process.env.DATABASE_URL_DIRECT!,
  },
});
