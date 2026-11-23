// Jefe de área = quien ocupa el asiento superior del área en el Accountability Chart (`seat`).
// Puro: recibe los asientos del org y no toca la base.

export interface HeadSeat {
  id: string;
  areaId: string | null;
  parentSeatId: string | null;
  holderProfileId: string | null;
  position: number;
  title: string;
}

/**
 * WHEN un área tiene asientos THE SYSTEM SHALL tomar los que no tienen padre o cuyo padre es de otra
 * área (o de ninguna), y de esos el de menor `position` y luego menor `title`. Sin titular en ese
 * asiento, el área no tiene jefe.
 */
export function areaHeads(seats: readonly HeadSeat[]): Map<string, string> {
  const byId = new Map(seats.map((s) => [s.id, s] as const));
  const top = new Map<string, HeadSeat>();
  for (const s of seats) {
    if (!s.areaId) continue;
    const parent = s.parentSeatId ? byId.get(s.parentSeatId) : undefined;
    if (parent && parent.areaId === s.areaId) continue;
    const current = top.get(s.areaId);
    if (!current || s.position < current.position || (s.position === current.position && s.title < current.title)) {
      top.set(s.areaId, s);
    }
  }
  const heads = new Map<string, string>();
  for (const [areaId, s] of top) if (s.holderProfileId) heads.set(areaId, s.holderProfileId);
  return heads;
}
