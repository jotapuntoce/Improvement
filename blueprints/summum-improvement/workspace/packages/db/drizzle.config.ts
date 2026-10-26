import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Herramienta standalone — Next.js no está en el medio, así que nadie más carga .env.local por ti.
// process.loadEnvFile es la API nativa de Node >=21.7 (estable en Node 24, el pin de este monorepo);
// se evita `dotenv` a propósito (blueprint §11, Deliberately not used) para no agregar una
// dependencia que Node ya resuelve. El try/catch es intencional: en CI/Vercel las variables ya
// vienen exportadas por la plataforma, no desde un archivo.
//
// Ruta ABSOLUTA a la raíz del monorepo — `pnpm --filter @jotapuntoce/db exec ...` corre este archivo
// con cwd = packages/db/, así que una ruta relativa ".env.local" nunca encuentra el archivo real
// (queda silenciosamente sin cargar por el catch, y DATABASE_URL_DIRECT llega undefined a
// dbCredentials — bug real encontrado corriendo `pnpm db:migrate` en este mismo paso).
// import.meta.dirname da `undefined` bajo el loader de config de drizzle-kit (verificado en este
// paso) — fileURLToPath(import.meta.url) sí funciona porque import.meta.url siempre está poblado.
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(path.join(monorepoRoot, ".env.local"));
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
