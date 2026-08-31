import { defineConfig } from "vitest/config";
import path from "node:path";

// Mismo patrón que apps/improvement/vitest.config.ts (blueprint §9 paso 2) — admin es JavaScript,
// así que no hay tsconfig-paths que resolver, solo el alias "@/" y la exclusión del bundle.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
    exclude: ["node_modules", ".next", "../../blueprints/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
