// Qué secciones tiene una empresa digital y qué alcance puede tener cada una. Módulo PURO: no toca
// base de datos, para que la regla de "quién ve qué" se pueda probar sin una empresa de por medio.
//
// Cuáles secciones existen sí es código y no dato: cada una es una pantalla real con su ruta. Lo que
// el dueño personaliza es cómo se llaman y cuáles apaga (organization.section_labels), no inventar
// pantallas nuevas.
import { z } from "zod";

export const SCOPES = ["empresa", "area", "propio", "ninguno"] as const;
export type Scope = (typeof SCOPES)[number];

export const SECTION_SLUGS = ["mapa", "objetivos", "equipo", "clientes", "powerups"] as const;
export type SectionSlug = (typeof SECTION_SLUGS)[number];

export interface Section {
  slug: SectionSlug;
  /** Nombre por defecto. El dueño lo puede cambiar en organization.section_labels. */
  label: string;
  hint: string;
  /** Alcances que esta sección SABE filtrar. "ninguno" siempre vale y no se lista aquí. */
  scopes: Exclude<Scope, "ninguno">[];
}

// `planos` NO está en esta lista aunque la ruta exista: es herramienta de Jose Carlos, cerrada por su
// propio guard de platform admin. Ningún tipo de permiso puede abrirla.
export const SECTIONS: Section[] = [
  { slug: "mapa", label: "Mapa de Construcción", hint: "En qué etapa va tu empresa digital", scopes: ["empresa"] },
  { slug: "objetivos", label: "Objetivos", hint: "Las metas del equipo y sus puntos", scopes: ["empresa", "area", "propio"] },
  { slug: "equipo", label: "Equipo", hint: "Quién trabaja contigo", scopes: ["empresa", "area"] },
  { slug: "clientes", label: "Clientes", hint: "Tu cartera y cómo va cada cuenta", scopes: ["empresa"] },
  { slug: "powerups", label: "PowerUps", hint: "Canjea los puntos que acumula tu equipo", scopes: ["empresa"] },
];

export function sectionBySlug(slug: string): Section | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}

/**
 * La llave se valida como string suelto y no como enum: en zod v4 un `z.record` con llave enum exige
 * que estén TODAS las llaves, y este mapa es parcial por diseño (lo que falta se niega). Las
 * secciones desconocidas se ignoran al leer, así que una fila vieja nunca rompe la pantalla.
 */
export const grantsSchema = z
  .record(z.string(), z.enum(SCOPES))
  .refine(
    (grants) =>
      Object.entries(grants).every(([slug, scope]) => {
        const section = sectionBySlug(slug);
        if (!section) return true;
        return scope === "ninguno" || section.scopes.includes(scope as Exclude<Scope, "ninguno">);
      }),
    { message: "Ese alcance no existe para esa sección." },
  );

export type Grants = z.infer<typeof grantsSchema>;

/**
 * WHEN quien pregunta es el dueño THE SYSTEM SHALL conceder `empresa` siempre, aunque tenga un tipo
 * asignado que diga otra cosa. WHEN no hay tipo, o el mapa no menciona la sección, THE SYSTEM SHALL
 * devolver `ninguno` — las dos reglas que Jose Carlos puso como no negociables.
 */
export function scopeFor(role: string, grants: unknown, section: SectionSlug): Scope {
  if (role === "owner") return "empresa";
  const parsed = grantsSchema.safeParse(grants ?? {});
  if (!parsed.success) return "ninguno";
  return (parsed.data[section] as Scope | undefined) ?? "ninguno";
}
