import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
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
