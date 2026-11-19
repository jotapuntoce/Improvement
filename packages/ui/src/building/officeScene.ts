// Modelo puro de la escena pixel-art de la oficina: zonas en celdas → rectángulos en píxeles, y la
// gente de cada área sentada en tiles (uno sí, uno no), en orden de llegada. Lo que no cabe se cuenta.

export const TILE = 16;

export interface SceneZone {
  kind: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  areaId: string | null;
  color: string | null;
}

export interface ScenePerson {
  profileId: string;
  name: string;
  areaId: string;
}

export interface OfficeSceneModel {
  rects: { kind: string; label: string; color: string | null; px: number; py: number; pw: number; ph: number; areaId: string | null }[];
  avatars: { profileId: string; name: string; initials: string; tx: number; ty: number }[];
  overflow: Record<string, number>;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0]!.charAt(0);
  return (words.length === 1 ? first : first + words[words.length - 1]!.charAt(0)).toUpperCase();
}

export function officeScene(zones: readonly SceneZone[], people: readonly ScenePerson[]): OfficeSceneModel {
  const rects = zones.map((z) => ({
    kind: z.kind,
    label: z.label,
    color: z.color,
    px: z.x * TILE,
    py: z.y * TILE,
    pw: z.w * TILE,
    ph: z.h * TILE,
    areaId: z.areaId,
  }));
  const avatars: OfficeSceneModel["avatars"] = [];
  const overflow: Record<string, number> = {};
  for (const z of zones) {
    if (z.kind !== "area" || !z.areaId) continue;
    const cols = Math.max(1, Math.floor((z.w - 1) / 2));
    const rows = Math.max(1, Math.floor((z.h - 1) / 2));
    people
      .filter((p) => p.areaId === z.areaId)
      .forEach((p, k) => {
        if (k >= cols * rows) {
          overflow[z.areaId!] = (overflow[z.areaId!] ?? 0) + 1;
          return;
        }
        avatars.push({
          profileId: p.profileId,
          name: p.name,
          initials: initials(p.name),
          tx: z.x + 1 + 2 * (k % cols),
          ty: z.y + 1 + 2 * Math.floor(k / cols),
        });
      });
  }
  return { rects, avatars, overflow };
}
