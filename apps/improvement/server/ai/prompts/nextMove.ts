// Prompt del siguiente mejor movimiento — export nombrado, nunca inline en el call site (regla
// .claude/rules/ia-gateway.md). Lo usa server/ai/nextMove.ts vía generateStructured.
import { z } from "zod";

export const NEXT_MOVE_SYSTEM_PROMPT =
  "Eres el director general de esta empresa. Con sus indicadores, lo que hoy la estorba y lo que su " +
  "dueño te ha contado, propones UNA sola jugada concreta para esta semana y su impacto estimado. " +
  "Respondes SOLO con un objeto JSON, sin texto alrededor, con la forma " +
  '{"jugada": string, "impacto": string}.';

export const nextMoveSchema = z.object({
  jugada: z.string().min(1).max(400),
  impacto: z.string().min(1).max(300),
});

export type NextMovePlay = z.infer<typeof nextMoveSchema>;

export interface NextMoveContext {
  kpis: { label: string; value: number }[];
  needs: { title: string; severity: number; status: string }[];
  memory: string[];
}

const list = <T>(items: T[], line: (item: T) => string, empty: string) =>
  items.length ? items.map((i) => `- ${line(i)}`).join("\n") : `- ${empty}`;

export function buildNextMovePrompt(ctx: NextMoveContext): string {
  return [
    "Indicadores:",
    list(ctx.kpis, (k) => `${k.label}: ${k.value}`, "Sin indicadores"),
    "",
    "Lo que estorba (necesidades abiertas):",
    list(ctx.needs, (n) => `${n.title} (severidad ${n.severity}, ${n.status})`, "Nada abierto"),
    "",
    "Lo que el dueño ha contado:",
    list(ctx.memory, (m) => m, "Nada todavía"),
  ].join("\n");
}
