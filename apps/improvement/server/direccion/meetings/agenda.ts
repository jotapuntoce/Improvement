// La agenda de la junta L10: el orden sale de MEETING_BLOCKS (schema) y los minutos de aquí. Ninguna
// pantalla repite la lista (.claude/rules/direccion.md). Módulo puro: sin base, sin sesión.
import { MEETING_BLOCKS } from "@jotapuntoce/db/schema";

export type MeetingBlock = (typeof MEETING_BLOCKS)[number];

const BLOQUES: Record<MeetingBlock, { label: string; minutes: number }> = {
  segue: { label: "Buenas noticias", minutes: 5 },
  scorecard: { label: "Scorecard", minutes: 5 },
  rocks: { label: "Rocas", minutes: 5 },
  headlines: { label: "Titulares", minutes: 5 },
  todos: { label: "Pendientes", minutes: 5 },
  ids: { label: "IDS", minutes: 60 },
  conclude: { label: "Cierre", minutes: 5 },
};

export const AGENDA: readonly { block: MeetingBlock; label: string; minutes: number }[] = MEETING_BLOCKS.map(
  (block) => ({ block, ...BLOQUES[block] }),
);

export const AGENDA_TOTAL_MINUTES = AGENDA.reduce((s, b) => s + b.minutes, 0);

export function nextBlock(block: MeetingBlock): MeetingBlock | null {
  return MEETING_BLOCKS[MEETING_BLOCKS.indexOf(block) + 1] ?? null;
}
