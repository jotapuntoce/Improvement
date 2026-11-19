// Worker de agentes: corre sin compilar (node src/main.ts). Solo marca el ritmo; el trabajo vive en
// apps/improvement/server/agents/runtime.ts. El ciclo llega en el paso 23.
import pkg from "../package.json" with { type: "json" };

if (process.argv.includes("--version")) {
  console.log(pkg.version);
  process.exit(0);
}
