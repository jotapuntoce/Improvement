// Resumen del pipeline (puro): una fila por etapa de DEAL_STAGES en su orden y la tasa de cierre.
// Sin probabilidades por etapa: solo lo que ya pasó.
import { DEAL_STAGES } from "@jotapuntoce/db/schema";

type Stage = (typeof DEAL_STAGES)[number];

export function pipelineSummary(deals: readonly { stage: Stage; amountCents: number }[]) {
  const stages = DEAL_STAGES.map((stage) => {
    const enEtapa = deals.filter((d) => d.stage === stage);
    return { stage, count: enEtapa.length, amountCents: enEtapa.reduce((s, d) => s + d.amountCents, 0) };
  });
  const ganados = stages.find((s) => s.stage === "ganado")!.count;
  const cerrados = ganados + stages.find((s) => s.stage === "perdido")!.count;
  return { stages, winRate: cerrados ? Math.round((ganados / cerrados) * 100) / 100 : null };
}
