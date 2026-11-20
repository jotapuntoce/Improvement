// Mapas como datos: un generador por tipo de lugar. Puro, sin base. Ningún mapa de un cliente vive en código:
// el dueño elige tipo y parámetros, y el resultado se guarda como filas de venue_seat.
import { z } from "zod";
import type { VENUE_KINDS, VENUE_SEAT_KINDS } from "@jotapuntoce/db/schema";
import { firstIssue } from "../validation.ts";

export type VenueKind = (typeof VENUE_KINDS)[number];
export type SeatsFailure = { ok: false; error: { code: "NOT_FOUND" | "VALIDATION_ERROR"; message: string } };
export type GeneratedSeat = { label: string; section: string | null; x: number; y: number; kind: (typeof VENUE_SEAT_KINDS)[number]; capacity: number };

export const MAX_PLACES = 2000;
export const seatsInvalid = (message: string): SeatsFailure => ({ ok: false, error: { code: "VALIDATION_ERROR", message } });

const n = (min: number, max?: number) => (max ? z.coerce.number().int().min(min).max(max) : z.coerce.number().int().min(min));
const theaterSchema = z.object({ rows: n(1, 30), seatsPerRow: n(1, 40) });
const tablesSchema = (defaultSeats: number) => z.object({ tables: n(1, 60), seatsPerTable: n(1).default(defaultSeats) });
const lotsSchema = z.object({ blocks: n(1, 20), lotsPerBlock: n(1, 50) });

/** Fila 1 → A, 26 → Z, 27 → AA (como columnas de hoja de cálculo). */
function rowName(i: number): string {
  let s = "";
  for (let k = i + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

function build(kind: VenueKind, params: unknown): { ok: true; data: GeneratedSeat[] } | SeatsFailure {
  const fail = (e: z.ZodError) => seatsInvalid(firstIssue(e, "Parámetros inválidos."));
  if (kind === "teatro") {
    const p = theaterSchema.safeParse(params);
    if (!p.success) return fail(p.error);
    return {
      ok: true,
      data: Array.from({ length: p.data.rows * p.data.seatsPerRow }, (_, i) => {
        const row = Math.floor(i / p.data.seatsPerRow);
        const col = i % p.data.seatsPerRow;
        return { label: `${rowName(row)}${col + 1}`, section: rowName(row), x: col, y: row, kind: "butaca" as const, capacity: 1 };
      }),
    };
  }
  if (kind === "lotes") {
    const p = lotsSchema.safeParse(params);
    if (!p.success) return fail(p.error);
    return {
      ok: true,
      data: Array.from({ length: p.data.blocks * p.data.lotsPerBlock }, (_, i) => {
        const block = Math.floor(i / p.data.lotsPerBlock);
        const lot = i % p.data.lotsPerBlock;
        return { label: `M${block + 1}-L${lot + 1}`, section: `M${block + 1}`, x: lot, y: block, kind: "lote" as const, capacity: 1 };
      }),
    };
  }
  const p = tablesSchema(kind === "bodas" || kind === "eventos" ? 10 : 4).safeParse(params);
  if (!p.success) return fail(p.error);
  const cols = Math.ceil(Math.sqrt(p.data.tables));
  return {
    ok: true,
    data: Array.from({ length: p.data.tables }, (_, i) => ({
      label: `M${i + 1}`,
      section: null,
      x: i % cols,
      y: Math.floor(i / cols),
      kind: "mesa" as const,
      capacity: p.data.seatsPerTable,
    })),
  };
}

/** Lugares del mapa; más de MAX_PLACES personas en total → VALIDATION_ERROR. */
export function generateLayout(kind: VenueKind, params: unknown): { ok: true; data: GeneratedSeat[] } | SeatsFailure {
  const r = build(kind, params);
  if (!r.ok) return r;
  if (r.data.reduce((s, seat) => s + seat.capacity, 0) > MAX_PLACES) return seatsInvalid(`Un mapa admite hasta ${MAX_PLACES} lugares.`);
  return r;
}
