// Acomodo de la oficina 2D (blueprint oficinas-digitales §4 "Acomodo de la oficina"). Puro, sin React:
// cuadrícula de 40×24 celdas, x/y desde 1. Las áreas van en la franja de filas 8-17, entre las zonas
// fijas de arriba (Dirección, Sala de juntas) y la de abajo (Recepción).

export const OFFICE_GRID = { cols: 40, rows: 24 } as const;

export type OfficeZoneKind = "area" | "direccion" | "sala" | "recepcion";

export interface OfficeZoneLayout {
  kind: OfficeZoneKind;
  label: string;
  areaId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FIXED_ZONES: readonly OfficeZoneLayout[] = [
  { kind: "direccion", label: "Dirección", x: 1, y: 1, w: 12, h: 6 },
  { kind: "sala", label: "Sala de juntas", x: 27, y: 1, w: 12, h: 6 },
  { kind: "recepcion", label: "Recepción", x: 14, y: 18, w: 12, h: 5 },
];

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function officeLayout(
  template: readonly string[],
  areas: { id: string; name: string }[],
): OfficeZoneLayout[] {
  if (areas.length > 12) throw new RangeError("officeLayout: máximo 12 áreas");
  const rank = new Map(template.map((t, i) => [normalize(t), i] as const));
  // Primero las del giro en su orden; las demás, alfabéticas (Infinity - Infinity = NaN cae al localeCompare).
  const pos = (name: string) => rank.get(normalize(name)) ?? Infinity;
  const ordered = [...areas].sort((a, b) => pos(a.name) - pos(b.name) || a.name.localeCompare(b.name, "es"));

  const n = ordered.length;
  const r = Math.ceil(n / 4);
  const c = Math.ceil(n / r);
  const cellW = Math.floor(38 / c);
  const cellH = Math.floor(10 / r);
  const zones = ordered.map((a, i): OfficeZoneLayout => ({
    kind: "area",
    label: a.name,
    areaId: a.id,
    x: 1 + (i % c) * cellW,
    y: 8 + Math.floor(i / c) * cellH,
    w: cellW - 1,
    h: cellH - 1,
  }));
  return [...zones, ...FIXED_ZONES];
}
