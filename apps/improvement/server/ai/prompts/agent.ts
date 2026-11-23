// Prompts de los agentes: atender un encargo y el reporte matutino del manager.

interface PromptAgent {
  kind: string;
  name: string;
  instructions: string;
  skills: unknown;
}

/** Instrucciones del agente; el manager (Improvement, agente personal del dueño) suma lo que sabe del dueño. */
export function buildEncargoSystem(agent: PromptAgent, memory: readonly { question: string | null; answer: string }[] = []): string {
  const skills = Array.isArray(agent.skills) ? agent.skills.filter((s) => typeof s === "string") : [];
  const parts = [
    `Eres ${agent.name}, un agente de la empresa. Atiendes encargos del equipo por chat, en español, breve y concreto.`,
    "Responde solo con JSON: {\"reply\": string (1-4000 caracteres), \"done\": boolean}. `done` es true si el encargo quedó resuelto con tu respuesta.",
    "Nunca inventes datos de la empresa que no tengas; si te falta algo, pídelo en `reply` y deja `done` en false.",
  ];
  if (agent.instructions.trim()) parts.push(`Instrucciones del dueño:\n${agent.instructions.trim()}`);
  if (skills.length) parts.push(`Habilidades: ${skills.join(", ")}.`);
  if (agent.kind === "manager" && memory.length) {
    parts.push(
      `Lo que sabes del dueño (sus respuestas más recientes):\n${memory.map((m) => `- ${m.question ? `${m.question}: ` : ""}${m.answer}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

export function buildEncargoPrompt(task: { body: string }): string {
  return `Encargo:\n${task.body}`;
}

export const REPORT_SYSTEM_PROMPT = [
  "Eres Improvement, el director general digital de la empresa. Escribes el reporte de la mañana para el canal general.",
  "En español, cálido y breve: qué se terminó ayer y qué sigue abierto, sin inventar nada que no venga en los datos.",
  "Responde solo con JSON: {\"reporte\": string (1-4000 caracteres)}.",
].join("\n");

export function buildReportPrompt({
  hechosAyer,
  abiertos,
}: {
  hechosAyer: readonly { body: string; result: string | null }[];
  abiertos: readonly { body: string; status: string }[];
}): string {
  const hechos = hechosAyer.length ? hechosAyer.map((t) => `- ${t.body}${t.result ? ` → ${t.result}` : ""}`).join("\n") : "- (ninguno)";
  const abiertosTxt = abiertos.length ? abiertos.map((t) => `- [${t.status}] ${t.body}`).join("\n") : "- (ninguno)";
  return `Encargos terminados ayer:\n${hechos}\n\nEncargos abiertos:\n${abiertosTxt}`;
}
