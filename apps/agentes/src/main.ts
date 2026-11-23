// Worker de agentes: corre sin compilar (node src/main.ts). Solo marca el ritmo; el trabajo vive en
// apps/improvement/server/agents/runtime.ts.
import pkg from "../package.json" with { type: "json" };
import { callTarea, readConfig } from "./client.ts";
import { tareasDue } from "./schedule.ts";

if (process.argv.includes("--version")) {
  console.log(pkg.version);
  process.exit(0);
}

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin archivo: las variables vienen del entorno (systemd EnvironmentFile).
}

const config = readConfig(process.env);
if (!config.ok) {
  console.error(`Faltan variables: ${config.missing.join(", ")}`);
  process.exit(1);
}

let running = false;
async function tick() {
  if (running || !config.ok) return; // ponytail: una corrida a la vez; si un tick tarda más de 60 s, el siguiente se salta
  running = true;
  try {
    for (const tarea of tareasDue(new Date())) {
      const r = await callTarea(config, tarea);
      console.log(JSON.stringify({ at: new Date().toISOString(), ...r }));
    }
  } finally {
    running = false;
  }
}

void tick();
const timer = setInterval(() => void tick(), 60_000);
const stop = () => {
  clearInterval(timer);
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
