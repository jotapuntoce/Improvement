import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Config raíz único para todo el monorepo (apps/admin en JS, apps/improvement en TS) — desviación
// documentada del default Biome del runtime track, ver blueprint.md §2. eslint-config-next resuelve
// TypeScript automáticamente cuando encuentra un tsconfig.json junto al archivo que lint-ea.
const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    // Defaults de eslint-config-next, replicados por app:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "**/node_modules/**",
    // Migraciones generadas — nunca editadas ni lint-eadas a mano:
    "packages/db/migrations/**",
    // El bundle del blueprint vive dentro del proyecto — nunca se camina como código fuente:
    "blueprints/**",
  ]),
]);

export default eslintConfig;
