// La V/TO de una empresa: valores, enfoque, meta a 10 años, estrategia, foto a 3 años y plan a 1 año.
//
// Leer la puede quien tenga la sección `vision`; escribir, solo el dueño — aunque un tipo de permiso
// diga `vision: empresa`, eso concede ver, no editar (.claude/rules/direccion.md). Cada sección es un
// jsonb con su propio esquema: lo que no pasa se lee vacío, así una fila vieja nunca rompe la pantalla.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { orgVision } from "@jotapuntoce/db/schema";
import { findOwnerMembership, resolveSection } from "../../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export const VISION_SECTIONS = [
  "core_values",
  "core_focus",
  "ten_year_target",
  "marketing_strategy",
  "three_year_picture",
  "one_year_plan",
] as const;
export type VisionSection = (typeof VISION_SECTIONS)[number];

// Los mensajes llegan tal cual a la pantalla (updateVisionSection devuelve el primero): sin ellos
// zod responde en inglés ("Too big: expected array to have <=7 items").
const tooLong = (max: number) => `Cada renglón cabe en ${max} caracteres.`;
const line = (max: number) => z.string().trim().min(1, "No dejes renglones vacíos.").max(max, tooLong(max));
const optionalLine = (max: number) => z.string().trim().max(max, tooLong(max));
const list = (what: string, max: number, min = 0) =>
  z
    .array(line(200))
    .min(min, `Escribe al menos ${min === 1 ? "uno" : min} en ${what}.`)
    .max(max, `Caben máximo ${max} en ${what}.`);
const date = z.iso.date("Esa fecha no es válida.").nullable();

const SCHEMAS = {
  core_values: z
    .array(line(120))
    .min(1, "Escribe al menos un valor.")
    .max(7, "Caben máximo 7 valores: quédate con los que de verdad deciden."),
  core_focus: z.object({ purpose: line(280), niche: line(280) }),
  ten_year_target: z.object({
    goal: line(280),
    year: z.number().int().min(2000, "Ese año no es válido.").max(2100, "Ese año no es válido.").nullable(),
  }),
  marketing_strategy: z.object({
    target_market: line(500),
    uniques: list("lo que los hace únicos", 3, 1),
    proven_process: optionalLine(500),
    guarantee: optionalLine(280),
  }),
  three_year_picture: z.object({
    date,
    revenue: optionalLine(120),
    profit: optionalLine(120),
    looks_like: list("cómo se ve", 15),
  }),
  one_year_plan: z.object({
    date,
    revenue: optionalLine(120),
    profit: optionalLine(120),
    goals: list("las metas del año", 7),
  }),
} as const;

type Content<S extends VisionSection> = z.infer<(typeof SCHEMAS)[S]>;

/** Qué columna de org_vision guarda cada sección. */
const COLUMN = {
  core_values: "coreValues",
  core_focus: "coreFocus",
  ten_year_target: "tenYearTarget",
  marketing_strategy: "marketingStrategy",
  three_year_picture: "threeYearPicture",
  one_year_plan: "oneYearPlan",
} as const satisfies Record<VisionSection, keyof typeof orgVision.$inferSelect>;

export interface VisionView {
  coreValues: string[];
  coreFocus: Content<"core_focus"> | null;
  tenYearTarget: Content<"ten_year_target"> | null;
  marketingStrategy: Content<"marketing_strategy"> | null;
  threeYearPicture: Content<"three_year_picture"> | null;
  oneYearPlan: Content<"one_year_plan"> | null;
  updatedAt: Date | null;
  canEdit: boolean;
}

function read<S extends VisionSection>(section: S, value: unknown): Content<S> | null {
  const parsed = SCHEMAS[section].safeParse(value);
  return parsed.success ? (parsed.data as Content<S>) : null;
}

async function loadView(orgId: string, canEdit: boolean): Promise<VisionView> {
  const [row] = await db.select().from(orgVision).where(eq(orgVision.orgId, orgId)).limit(1);
  return {
    coreValues: read("core_values", row?.coreValues) ?? [],
    coreFocus: read("core_focus", row?.coreFocus),
    tenYearTarget: read("ten_year_target", row?.tenYearTarget),
    marketingStrategy: read("marketing_strategy", row?.marketingStrategy),
    threeYearPicture: read("three_year_picture", row?.threeYearPicture),
    oneYearPlan: read("one_year_plan", row?.oneYearPlan),
    updatedAt: row?.updatedAt ?? null,
    canEdit,
  };
}

/** La V/TO del org, o `null` si la persona no tiene la sección. 404 si no es miembro. */
export async function getVision(userId: string, orgId: string): Promise<VisionView | null> {
  const { membership, scope } = await resolveSection(userId, orgId, "vision");
  if (scope === "ninguno") return null;
  return loadView(orgId, membership.role === "owner");
}

export async function updateVisionSection(
  userId: string,
  orgId: string,
  section: unknown,
  input: unknown,
): Promise<Result<VisionView>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño edita la visión.", "FORBIDDEN");
  }

  const which = z.enum(VISION_SECTIONS).safeParse(section);
  if (!which.success) return fail("Esa sección de la visión no existe.");
  const content = SCHEMAS[which.data].safeParse(input);
  if (!content.success) return fail(content.error.issues[0]?.message ?? "Revisa lo que escribiste.");

  const column = COLUMN[which.data];
  await db
    .insert(orgVision)
    .values({ orgId, [column]: content.data, updatedBy: userId })
    .onConflictDoUpdate({
      target: orgVision.orgId,
      set: { [column]: content.data, updatedBy: userId, updatedAt: new Date() },
    });

  return { ok: true, data: await loadView(orgId, true) };
}
