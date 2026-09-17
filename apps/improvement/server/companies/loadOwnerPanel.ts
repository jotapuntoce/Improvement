// Todo lo que dibuja el panel del dueño (/empresas) en una sola llamada: su portafolio, la fase de
// construcción de cada empresa y los KPIs que eligió ver.
//
// Une dos cosas que antes se dibujaban por separado y que para el dueño son la misma: las empresas
// que ya existen y las que pidió y todavía no se aprueban. Una solicitud pendiente ES una empresa en
// construcción parada en la fase 1 — enseñarla en el mismo tracker que las demás es lo que hace que
// "voy en el paso 1 de 8" se entienda sin explicación.
import { asc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { companyRequest } from "@jotapuntoce/db/schema";
import { BUILD_STAGES } from "@jotapuntoce/ui/building/buildStages.ts";
import { loadOrgKpis, type KpiCard } from "../kpis/loadKpis.ts";
import { getMyProfile, type MyProfile } from "../profile/mutations.ts";
import { loadCompanies } from "./loadCompanies.ts";
import type { StageRow } from "./companyList.ts";

export type PanelCompanyStatus = "activa" | "pendiente" | "rechazada";

export interface PanelCompany {
  /** Identidad estable para el selector y el key de React — una solicitud todavía no tiene orgId. */
  key: string;
  orgId: string | null;
  name: string;
  industry: string | null;
  status: PanelCompanyStatus;
  stages: StageRow[];
  currentIndex: number;
  /** null mientras la empresa no exista: una solicitud pendiente no tiene nada que medir todavía. */
  kpis: KpiCard[] | null;
}

export interface OwnerPanel {
  profile: MyProfile | null;
  companies: PanelCompany[];
}

/** Las 8 fases con la primera en progreso — el estado real de una solicitud que espera aprobación. */
function pendingStages(): StageRow[] {
  return BUILD_STAGES.map((stage) => ({
    stageOrder: stage.order,
    stageName: stage.name,
    status: stage.order === 1 ? "en_progreso" : "bloqueada",
  }));
}

export async function loadOwnerPanel(userId: string): Promise<OwnerPanel> {
  const [profile, companies, requests] = await Promise.all([
    getMyProfile(userId),
    loadCompanies(userId),
    db
      .select()
      .from(companyRequest)
      .where(eq(companyRequest.requesterId, userId))
      .orderBy(asc(companyRequest.createdAt)),
  ]);

  const kpisByOrg = await loadOrgKpis(companies.map((c) => c.orgId));

  const active: PanelCompany[] = companies.map((c) => ({
    key: c.orgId,
    orgId: c.orgId,
    name: c.name,
    industry: c.industry,
    status: "activa",
    stages: c.stages,
    currentIndex: c.currentIndex,
    kpis: kpisByOrg.get(c.orgId) ?? null,
  }));

  // Solo las que siguen esperando o fueron rechazadas: una solicitud aprobada ya es una de las
  // empresas de arriba, y dibujarla otra vez la duplicaría en el selector.
  const openRequests: PanelCompany[] = requests
    .filter((r) => r.status !== "approved")
    .map((r) => ({
      key: `solicitud:${r.id}`,
      orgId: null,
      name: r.companyName,
      industry: r.industry,
      status: r.status === "rejected" ? ("rechazada" as const) : ("pendiente" as const),
      stages: r.status === "rejected" ? [] : pendingStages(),
      currentIndex: r.status === "rejected" ? -1 : 0,
      kpis: null,
    }));

  return { profile, companies: [...openRequests, ...active] };
}

/**
 * Cuál empresa muestra el tracker de arriba cuando el dueño no eligió ninguna.
 *
 * WHEN hay una empresa en espera THE SYSTEM SHALL mostrarla siempre — criterio explícito de Jose
 * Carlos: se construye una empresa a la vez por cliente, así que la que está esperando es la que
 * importa. Si no hay ninguna en espera, la menos avanzada; si todas terminaron, la primera.
 */
export function defaultSelection(companies: PanelCompany[]): PanelCompany | null {
  if (companies.length === 0) return null;

  const waiting = companies.find((c) => c.status === "pendiente");
  if (waiting) return waiting;

  const active = companies.filter((c) => c.status === "activa");
  if (active.length === 0) return companies[0] ?? null;

  return active.reduce((least, c) => (c.currentIndex < least.currentIndex ? c : least));
}
