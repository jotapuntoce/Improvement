// Puro: qué tasa aplica y cuánto es la comisión de Summum. La personalizada del barco gana; si no
// hay, la de fábrica; si no hay ninguna, null — el cobro se rechaza, nunca sale con 0 % por omisión.
export type FeeChargeKind = "venta_propia" | "proyecto_summum";

export interface RateRow {
  barcoOrgId: string | null;
  chargeKind: FeeChargeKind;
  percentBps: number;
  fixedCents: number;
}

export function pickRate(rates: RateRow[], barcoOrgId: string, kind: FeeChargeKind): RateRow | null {
  const ofKind = rates.filter((r) => r.chargeKind === kind);
  return ofKind.find((r) => r.barcoOrgId === barcoOrgId) ?? ofKind.find((r) => r.barcoOrgId === null) ?? null;
}

export function feeCents(grossCents: number, rate: Pick<RateRow, "percentBps" | "fixedCents">): number {
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) throw new Error("El monto debe ser centavos enteros positivos.");
  const pct = Math.round((grossCents * rate.percentBps) / 10_000);
  return Math.min(grossCents, pct + rate.fixedCents);
}
