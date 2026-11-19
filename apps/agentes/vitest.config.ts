import { defineConfig } from "vitest/config";

// Worker de agentes (blueprint oficinas-digitales §19.6): sin alias, sin setupFiles y sin env — sus
// pruebas son puras y usan fetch falso. passWithNoTests: el paso 22 crea el paquete antes que su primera
// prueba (paso 23).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "../../blueprints/**"],
    passWithNoTests: true,
  },
});
