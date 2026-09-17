// Lista cerrada de giros — fuente única para el <select> de industria (apps/improvement,
// apps/admin) y para el glyph que elige AppIconLarge.tsx. "otro" es también el fallback: cualquier
// organization.industry/company_request.industry que no esté aquí (incluido null) usa el glyph
// default (la cuadrícula original) — ver isIndustry() abajo, nunca lanza.
export const INDUSTRIES = [
  { id: "restaurante", label: "Restaurante" },
  { id: "retail", label: "Tienda / Retail" },
  { id: "servicios", label: "Servicios profesionales" },
  { id: "salud", label: "Salud" },
  { id: "construccion", label: "Construcción" },
  { id: "tecnologia", label: "Tecnología" },
  { id: "manufactura", label: "Manufactura" },
  { id: "otro", label: "Otro" },
] as const;

export type Industry = (typeof INDUSTRIES)[number]["id"];

const INDUSTRY_IDS = new Set<string>(INDUSTRIES.map((i) => i.id));

export function isIndustry(value: string | null | undefined): value is Industry {
  return value != null && INDUSTRY_IDS.has(value);
}
