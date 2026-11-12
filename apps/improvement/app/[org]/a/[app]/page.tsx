// Una app con la vista que le toca: la que el dueño pidió en el arranque o dejó guardada
// (server/apps/views.ts). Lo que se ve (etapas, nombres, campos) sale de la configuración del org,
// no de código por app. requireSection respeta la "Vista previa como" del dueño.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { createRecord, getAppMeta, listRecords, moveRecord } from "@/server/apps/records.ts";
import { listFields } from "@/server/apps/fields.ts";
import { resolveView, setDefaultView, VIEW_NAMES } from "@/server/apps/views.ts";
import { IMPORTABLE } from "@/server/import/jobs.ts";
import { ControlPanel } from "@/components/views/ControlPanel.tsx";
import { ListView } from "@/components/views/ListView.tsx";
import { KanbanBoard } from "@/components/views/KanbanBoard.tsx";
import { CalendarView } from "@/components/views/CalendarView.tsx";
import { NumbersView } from "@/components/views/NumbersView.tsx";
import { GroupedTable } from "@/components/views/GroupedTable.tsx";

export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; app: string }>;
  searchParams: Promise<{ q?: string; vista?: string; mes?: string; error?: string; aviso?: string }>;
}) {
  const { org: orgId, app } = await params;
  const { q = "", vista: rawVista, mes, error, aviso } = await searchParams;
  const meta = await getAppMeta(orgId, app);
  if (!meta) notFound();
  const { membership } = await requireSection(orgId, meta.section);
  const userId = membership.userId;
  const result = await listRecords(userId, orgId, app, { q });
  if (!result.ok) notFound();
  const [{ view, saved, options }, fields] = await Promise.all([
    resolveView(userId, orgId, meta, rawVista),
    listFields(userId, orgId, app),
  ]);

  const base = `/${orgId}/a/${app}`;
  const { records, stages } = result.data;
  const stageName = Object.fromEntries(stages.map((s) => [s.key, s.name]));
  const field = (key: string | undefined) => fields.find((f) => f.key === key);

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

  async function guardarVista(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await setDefaultView(actor, orgId, app, formData.get("kind")?.toString() ?? "");
    if (!r.ok) redirect(`${base}?error=${encodeURIComponent(r.error.message)}`);
    revalidatePath(base);
    redirect(`${base}?aviso=${encodeURIComponent(`${meta!.name} abrirá en ${VIEW_NAMES[r.data.kind].toLowerCase()}.`)}`);
  }

  const col = view.columns[0] ?? "";
  const sum = field(col);
  const group = field(col);
  return (
    <main className="config-page view-page">
      <ControlPanel title={meta.name} base={base} q={q} vista={view.kind}
        options={options.map((k) => ({ kind: k, name: VIEW_NAMES[k] }))}
        saveDefault={membership.role === "owner" && view.kind !== saved ? guardarVista : undefined}
        create={meta.kind === "custom" ? nuevo : undefined}
        importHref={membership.role === "owner" && IMPORTABLE(meta) ? `${base}/importar` : undefined}
      />
      {error && <p className="invite-error" role="alert">{error}</p>}
      {aviso && <p className="config-hint" role="status">{aviso}</p>}
      {view.kind === "kanban" && <KanbanBoard base={base} records={records} stages={stages} move={move} />}
      {view.kind === "lista" && <ListView base={base} records={records} stageName={stageName} />}
      {view.kind === "calendario" && (
        <CalendarView base={base} records={records} dateKey={col} dateLabel={sum?.label ?? "Fecha"} mes={mes} />
      )}
      {view.kind === "numeros" && (
        <NumbersView records={records} stages={stages}
          sum={sum && (sum.type === "dinero" || sum.type === "numero") ? { key: sum.key, label: sum.label, type: sum.type } : null} />
      )}
      {view.kind === "tabla" && (
        <GroupedTable records={records} stageName={stageName} groupBy={group ? { key: group.key, label: group.label } : null} />
      )}
    </main>
  );
}
