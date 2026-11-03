// Las apps base que toda empresa trae (catálogo genérico, igual para todos) y la siembra por org. Lo
// que cada dueño cambia —nombres, orden, grupos, campos extra— vive en filas, no aquí.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, appStage, DEAL_STAGES, PROJECT_AUTHORIZATION, TICKET_STATUSES } from "@jotapuntoce/db/schema";
import type { SectionSlug } from "../permissions/sections.ts";

export type BaseAppKey = "clientes" | "ventas" | "proyectos" | "postventa";

export interface BaseApp {
  key: BaseAppKey;
  name: string;
  section: SectionSlug;
  icon: string;
  group: "Ventas" | "Operación";
  stages: { key: string; name: string }[];
}

const label = (key: string) => (key.charAt(0).toUpperCase() + key.slice(1)).replace("_", " ");

export const BASE_APPS: BaseApp[] = [
  {
    key: "clientes", name: "Clientes", section: "clientes", icon: "users", group: "Ventas",
    stages: [{ key: "healthy", name: "Activo" }, { key: "neutral", name: "Neutral" }, { key: "at_risk", name: "En riesgo" }],
  },
  {
    key: "ventas", name: "Ventas", section: "clientes", icon: "handshake", group: "Ventas",
    stages: DEAL_STAGES.map((k) => ({ key: k, name: k === "negociacion" ? "Negociación" : label(k) })),
  },
  {
    key: "proyectos", name: "Proyectos", section: "proyectos", icon: "hammer", group: "Operación",
    stages: PROJECT_AUTHORIZATION.map((k) => ({ key: k, name: label(k) })),
  },
  {
    key: "postventa", name: "Postventa", section: "postventa", icon: "lifebuoy", group: "Operación",
    stages: TICKET_STATUSES.map((k) => ({ key: k, name: k === "en_proceso" ? "En proceso" : label(k) })),
  },
];

/** Siembra grupos, apps base y sus etapas si faltan. Idempotente: nunca pisa lo que el dueño cambió. */
export async function ensureOrgApps(orgId: string): Promise<void> {
  const existing = await db.select({ key: appModel.key }).from(appModel).where(eq(appModel.orgId, orgId));
  const have = new Set(existing.map((r) => r.key));
  if (BASE_APPS.every((a) => have.has(a.key))) return;

  await db.transaction(async (tx) => {
    // Serializa siembras simultáneas de la misma org (layout y página en la primera carga).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);
    const again = await tx.select({ key: appModel.key }).from(appModel).where(eq(appModel.orgId, orgId));
    const haveNow = new Set(again.map((r) => r.key));
    const missing = BASE_APPS.filter((a) => !haveNow.has(a.key));
    if (missing.length === 0) return;
    const groups = new Map<string, string>();
    for (const [position, name] of [...new Set(BASE_APPS.map((a) => a.group))].entries()) {
      const [found] = await tx.select({ id: appGroup.id }).from(appGroup).where(and(eq(appGroup.orgId, orgId), eq(appGroup.name, name)));
      const id = found?.id ?? (await tx.insert(appGroup).values({ orgId, name, position }).returning({ id: appGroup.id }))[0]!.id;
      groups.set(name, id);
    }
    for (const app of missing) {
      const [row] = await tx
        .insert(appModel)
        .values({ orgId, key: app.key, name: app.name, kind: "base", section: app.section, icon: app.icon, groupId: groups.get(app.group), position: BASE_APPS.indexOf(app) })
        .onConflictDoNothing()
        .returning({ id: appModel.id });
      if (!row) continue;
      await tx.insert(appStage).values(app.stages.map((s, position) => ({ orgId, appId: row.id, key: s.key, name: s.name, position })));
    }
  });
}
