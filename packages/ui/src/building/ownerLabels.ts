// Cómo se presenta el dueño en su propio panel. Lista cerrada, misma forma que INDUSTRIES
// (industries.ts): fuente única del <select> de configuración y del chip que se dibuja junto a su
// nombre. Cualquier valor fuera de esta lista (incluido null) = sin chip, nunca lanza.
export const OWNER_LABELS = [
  { id: "empresario", label: "Empresario" },
  { id: "emprendedor", label: "Emprendedor" },
  { id: "dueno_de_negocio", label: "Dueño de negocio" },
  { id: "profesionista", label: "Profesionista" },
] as const;

export type OwnerLabel = (typeof OWNER_LABELS)[number]["id"];

const OWNER_LABEL_IDS = new Set<string>(OWNER_LABELS.map((l) => l.id));

export function isOwnerLabel(value: string | null | undefined): value is OwnerLabel {
  return value != null && OWNER_LABEL_IDS.has(value);
}

/** El texto que se dibuja en el chip, o null si el valor guardado ya no está en la lista. */
export function ownerLabelText(value: string | null | undefined): string | null {
  return OWNER_LABELS.find((l) => l.id === value)?.label ?? null;
}
