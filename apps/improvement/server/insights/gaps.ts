// Qué falta en tu proceso (G9): compara las apps del negocio contra la plantilla de su giro
// (templates.ts) y lista apps, etapas y campos que faltan, emparejados por nombre sin acentos. Cada
// faltante se agrega con un clic por las mismas puertas de siempre. Solo el dueño.
import { and, eq, max } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appField, appModel, appStage, organization } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { ensureOrgApps } from "../apps/catalog.ts";
import { slugKey } from "../apps/custom.ts";
import { addField } from "../apps/fields.ts";
import { applyTemplate, templateFor, type TemplateApp } from "../apps/templates.ts";
import { createNeed, referNeedToSummum } from "../needs/mutations.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR") => ({ ok: false as const, error: { code, message } });
const FORBIDDEN = fail("Solo el dueño ve qué falta en su proceso.", "FORBIDDEN");

export type Gap =
  | { id: string; kind: "app"; title: string; app: TemplateApp }
  | { id: string; kind: "etapa"; title: string; appKey: string; appId: string; stage: string }
  | { id: string; kind: "campo"; title: string; appKey: string; field: TemplateApp["fields"][number] };

/** Lo que la plantilla del giro trae y el negocio todavía no tiene. */
export async function processGaps(userId: string, orgId: string): Promise<Result<Gap[]>> {
  if (!(await findOwnerMembership(userId, orgId))) return FORBIDDEN;
  await ensureOrgApps(orgId);
  const [org] = await db.select({ industry: organization.industry }).from(organization).where(eq(organization.id, orgId));
  const [apps, stages, fields] = await Promise.all([
    db.select({ id: appModel.id, key: appModel.key, name: appModel.name }).from(appModel).where(eq(appModel.orgId, orgId)),
    db.select({ appId: appStage.appId, name: appStage.name }).from(appStage).where(eq(appStage.orgId, orgId)),
    db.select({ appId: appField.appId, label: appField.label }).from(appField).where(eq(appField.orgId, orgId)),
  ]);
  const gaps: Gap[] = [];
  for (const t of templateFor(org?.industry ?? null).apps) {
    const mine = apps.find((a) => slugKey(a.name) === slugKey(t.name));
    if (!mine) {
      gaps.push({ id: `app:${slugKey(t.name)}`, kind: "app", title: `La app «${t.name}» (${t.stages.join(" → ")})`, app: t });
      continue;
    }
    const haveStages = new Set(stages.filter((s) => s.appId === mine.id).map((s) => slugKey(s.name)));
    for (const s of t.stages) {
      if (!haveStages.has(slugKey(s))) gaps.push({ id: `etapa:${mine.key}:${slugKey(s)}`, kind: "etapa", title: `La etapa «${s}» en ${mine.name}`, appKey: mine.key, appId: mine.id, stage: s });
    }
    const haveFields = new Set(fields.filter((f) => f.appId === mine.id).map((f) => slugKey(f.label)));
    for (const f of t.fields) {
      if (!haveFields.has(slugKey(f.label))) gaps.push({ id: `campo:${mine.key}:${slugKey(f.label)}`, kind: "campo", title: `El campo «${f.label}» en ${mine.name}`, appKey: mine.key, field: f });
    }
  }
  return { ok: true, data: gaps };
}

async function findGap(userId: string, orgId: string, gapId: string): Promise<Result<Gap>> {
  const all = await processGaps(userId, orgId);
  if (!all.ok) return all;
  const gap = all.data.find((g) => g.id === gapId);
  return gap ? { ok: true, data: gap } : fail("Eso ya no falta.", "NOT_FOUND");
}

/** "Agregar": crea la app, la etapa (al final) o el campo que falta. */
export async function applyGap(userId: string, orgId: string, gapId: string): Promise<Result<true>> {
  const found = await findGap(userId, orgId, gapId);
  if (!found.ok) return found;
  const gap = found.data;
  if (gap.kind === "app") {
    const r = await applyTemplate(userId, orgId, [gap.app]);
    return r.ok ? { ok: true, data: true } : r;
  }
  if (gap.kind === "campo") {
    const r = await addField(userId, orgId, gap.appKey, { label: gap.field.label, type: gap.field.type, options: gap.field.options ?? [] });
    return r.ok ? { ok: true, data: true } : r;
  }
  const [{ last } = { last: null }] = await db.select({ last: max(appStage.position) }).from(appStage).where(eq(appStage.appId, gap.appId));
  const taken = await db.select({ key: appStage.key }).from(appStage).where(and(eq(appStage.appId, gap.appId), eq(appStage.key, slugKey(gap.stage))));
  const key = taken.length ? `${slugKey(gap.stage)}-${(last ?? 0) + 2}` : slugKey(gap.stage);
  await db.insert(appStage).values({ orgId, appId: gap.appId, key, name: gap.stage, position: (last ?? -1) + 1 });
  return { ok: true, data: true };
}

/** Puente a Summum desde un faltante (G11): lo que el dueño no quiere armar solo. */
export async function gapToSummum(userId: string, orgId: string, gapId: string, note: string | null): Promise<Result<{ needId: string }>> {
  const found = await findGap(userId, orgId, gapId);
  if (!found.ok) return found;
  const need = await createNeed(userId, orgId, {
    title: `Falta en el proceso: ${found.data.title}`.slice(0, 200),
    detail: [found.data.title, note].filter(Boolean).join("\n\n").slice(0, 2000),
    areaId: null,
    severity: 2,
    source: "improvement",
  });
  if (!need.ok) return need;
  const sent = await referNeedToSummum(userId, orgId, need.data.id, note);
  return sent.ok ? { ok: true, data: { needId: need.data.id } } : sent;
}
