// Una app base en lista o kanban. Lo que se ve (etapas, nombres) sale de la configuración del org,
// no de código por app. requireSection respeta la "Vista previa como" del dueño.
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { listRecords, moveRecord } from "@/server/apps/records.ts";
import { BASE_APPS } from "@/server/apps/catalog.ts";
import { ControlPanel } from "@/components/views/ControlPanel.tsx";
import { ListView } from "@/components/views/ListView.tsx";
import { KanbanBoard } from "@/components/views/KanbanBoard.tsx";

export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; app: string }>;
  searchParams: Promise<{ q?: string; vista?: string }>;
}) {
  const { org: orgId, app } = await params;
  const { q = "", vista: rawVista } = await searchParams;
  const meta = BASE_APPS.find((a) => a.key === app);
  if (!meta) notFound();
  const { membership } = await requireSection(orgId, meta.section);
  const result = await listRecords(membership.userId, orgId, app, { q });
  if (!result.ok) notFound();

  const vista = rawVista === "kanban" ? "kanban" : "lista";
  const base = `/${orgId}/a/${app}`;
  const stageName = Object.fromEntries(result.data.stages.map((s) => [s.key, s.name]));

  async function move(id: string, stage: string) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    await moveRecord(actor, orgId, app, id, stage);
    revalidatePath(base);
  }

  return (
    <main className="config-page view-page">
      <ControlPanel title={meta.name} base={base} q={q} vista={vista} />
      {vista === "kanban" ? (
        <KanbanBoard base={base} records={result.data.records} stages={result.data.stages} move={move} />
      ) : (
        <ListView base={base} records={result.data.records} stageName={stageName} />
      )}
    </main>
  );
}
