import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // El default de Vitest (5s) no alcanza: cada prueba habla con un proyecto Supabase remoto real,
    // y las más pesadas (tests/powerups.test.ts) tardan hasta ~7s de ida y vuelta; con la red lenta
    // varias pasan de 20s (2026-11-04), así que el margen es de 60s.
    testTimeout: 60000,
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "node_modules",
      ".next",
      "tests/e2e/**",
      "../../blueprints/**", // el bundle del blueprint vive dentro del proyecto — nunca se recolecta como test
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
