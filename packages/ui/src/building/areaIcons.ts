// El glifo de un área: qué función cumple, dibujado.
//
// Categorías de FUNCIÓN, nunca de giro. "Ventas" y "Soporte" existen en una constructora igual que
// en una agencia; "Cortinas" no existiría más que en una empresa. Este archivo es motor
// (.claude/rules/motor-generico.md): ninguna entrada menciona una empresa, un cliente ni un rubro.
//
// Los ids están en español y son exactamente los del check constraint `area_icon_check`
// (packages/db/src/schema.ts). Si aquí se agrega uno, la migración tiene que agregarlo allá — y al
// revés, un icon que la base acepte y este archivo no conozca cae en el glifo neutro sin lanzar.
//
// Los trazos van en un viewBox de 24×24 y usan `currentColor`: el color lo pone quien lo dibuja,
// que es el color del área. Sin hex aquí (.claude/rules/tokens-de-diseno.md).

export const AREA_ICONS = [
  "ventas",
  "operaciones",
  "ingenieria",
  "soporte",
  "finanzas",
  "personas",
  "marketing",
  "legal",
  "direccion",
  "otro",
] as const;

export type AreaIcon = (typeof AREA_ICONS)[number];

export interface AreaIconDef {
  id: AreaIcon;
  /** Cómo se llama en el selector del dueño. */
  label: string;
  /** El trazo, sobre un viewBox de 24×24. */
  path: string;
}

export const AREA_ICON_DEFS: AreaIconDef[] = [
  // Una flecha que sube sobre su base: lo que entra.
  { id: "ventas", label: "Ventas", path: "M3 20h18M6 20V12M11 20V7M16 20v-9M21 20V4" },
  // Un engrane simplificado: lo que se hace todos los días.
  {
    id: "operaciones",
    label: "Operaciones",
    path: "M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  },
  // Corchetes de código: lo que se construye.
  { id: "ingenieria", label: "Ingeniería", path: "M8 6l-5 6 5 6M16 6l5 6-5 6M13 4l-2 16" },
  // Un auricular: quien contesta.
  {
    id: "soporte",
    label: "Soporte",
    path: "M4 14v-2a8 8 0 0116 0v2M4 14h2v5H5a1 1 0 01-1-1v-4zM20 14h-2v5h1a1 1 0 001-1v-4z",
  },
  // Una moneda con su barra: el dinero.
  { id: "finanzas", label: "Finanzas", path: "M12 3v18M16 7H10a3 3 0 000 6h4a3 3 0 010 6H8" },
  // Dos siluetas: quién trabaja aquí.
  {
    id: "personas",
    label: "Personas",
    path: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20v-1a5 5 0 015-5h2a5 5 0 015 5v1M17 6a3 3 0 010 6M19 20v-1a4 4 0 00-2-3.4",
  },
  // Un megáfono: lo que se dice hacia afuera.
  { id: "marketing", label: "Marketing", path: "M4 10v4h3l7 4V6l-7 4H4zM18 9a4 4 0 010 6" },
  // La balanza.
  {
    id: "legal",
    label: "Legal",
    path: "M12 4v16M5 20h14M7 8l-3 6h6l-3-6zM17 8l-3 6h6l-3-6zM5 8h14",
  },
  // Una brújula: hacia dónde va.
  { id: "direccion", label: "Dirección", path: "M12 21a9 9 0 100-18 9 9 0 000 18zM15 9l-2 4-4 2 2-4 4-2z" },
  // Un cuadro: el área que todavía no se sabe cómo llamar.
  { id: "otro", label: "Otro", path: "M5 5h14v14H5z" },
];

const BY_ID = new Map(AREA_ICON_DEFS.map((d) => [d.id, d] as const));

/**
 * El glifo de un id, o el neutro. Nunca lanza: una fila vieja con un icon que este archivo ya no
 * conoce dibuja el cuadro, no rompe la recepción.
 */
export function areaIcon(id: string | null | undefined): AreaIconDef {
  return (id && BY_ID.get(id as AreaIcon)) || BY_ID.get("otro")!;
}
