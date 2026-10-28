// Una app base en lista o kanban. Lo que se ve (etapas, nombres) sale de la configuración del org,
// no de código por app. requireSection respeta la "Vista previa como" del dueño.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { createRecord, getAppMeta, listRecords, moveRecord } from "@/server/apps/records.ts";
import { ControlPanel } from "@/components/views/ControlPanel.tsx";
import { ListView } from "@/components/views/ListView.tsx";
import { KanbanBoard } from "@/components/views/KanbanBoard.tsx";

export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; app: string }>;
  searchParams: Promise<{ q?: string; vista?: string; error?: string }>;
}) {
  const { org: orgId, app } = await params;
  const { q = "", vista: rawVista, error } = await searchParams;
  const meta = await getAppMeta(orgId, app);
  if (!meta) notFound();
  const { membership } = await requireSection(orgId, meta.section);
  const result = await listRecords(membership.userId, orgId, app, { q });
  if (!result.ok) notFound();

  const vista = rawVista === "kanban" ? "kanban" : "lista";
  const base = `/${orgId}/a/${app}`;
  const stageName = Object.fromEntries(result.data.stages.map((s) => [s.key, s.name]));

  async function move(id: string, stage: string): Promise<string | null> {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await moveRecord(actor, orgId, app, id, stage);
    revalidatePath(base);
    return r.ok ? null : r.error.message;
  }

  async function nuevo(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await createRecord(actor, orgId, app, formData.get("title")?.toString() ?? "");
    if (r.ok) redirect(`${base}/${r.data.id}`);
    redirect(`${base}?error=${encodeURIComponent(r.error.message)}`);
  }

  return (
    <main className="config-page view-page">
      <ControlPanel title={meta.name} base={base} q={q} vista={vista} create={meta.kind === "custom" ? nuevo : undefined} />
      {error && <p className="invite-error" role="alert">{error}</p>}
      {vista === "kanban" ? (
        <KanbanBoard base={base} records={result.data.records} stages={result.data.stages} move={move} />
      ) : (
        <ListView base={base} records={result.data.records} stageName={stageName} />
      )}
    </main>
  );
}
