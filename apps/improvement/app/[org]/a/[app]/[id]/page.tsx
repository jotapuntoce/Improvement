// La ficha: etapa, campos extra (app_field) y bitácora.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { addNote, getRecord, listActivity, listRecords, saveCustomValues } from "@/server/apps/records.ts";
import { listFields } from "@/server/apps/fields.ts";
import { BASE_APPS } from "@/server/apps/catalog.ts";
import { RecordForm } from "@/components/views/RecordForm.tsx";
import { ActivityLog } from "@/components/views/ActivityLog.tsx";

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; app: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId, app, id } = await params;
  const { error } = await searchParams;
  const meta = BASE_APPS.find((a) => a.key === app);
  if (!meta) notFound();
  const { membership } = await requireSection(orgId, meta.section);
  const userId = membership.userId;
  const record = await getRecord(userId, orgId, app, id);
  if (!record.ok) notFound();
  const [fields, activity, list] = await Promise.all([
    listFields(userId, orgId, app),
    listActivity(userId, orgId, app, id),
    listRecords(userId, orgId, app),
  ]);
  const stages = list.ok ? list.data.stages : [];
  const pagina = `/${orgId}/a/${app}/${id}`;

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    // Next agrega llaves internas ($ACTION_…) al FormData de una Server Action.
    const values = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, v.toString()]));
    const r = await saveCustomValues(actor, orgId, app, id, values);
    if (!r.ok) redirect(`${pagina}?error=${encodeURIComponent(r.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  async function nota(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await addNote(actor, orgId, app, id, formData.get("body")?.toString() ?? "");
    if (!r.ok) redirect(`${pagina}?error=${encodeURIComponent(r.error.message)}`);
    revalidatePath(pagina);
  }

  return (
    <main className="config-page view-page">
      <p className="config-hint"><Link href={`/${orgId}/a/${app}`}>Volver a {meta.name}</Link></p>
      <h1 className="config-title">{record.data.title}</h1>
      {record.data.subtitle && <p className="config-hint">{record.data.subtitle}</p>}
      <ol className="view-stagebar" aria-label="Etapa">
        {stages.map((s) => (
          <li key={s.key} aria-current={s.key === record.data.stage ? "step" : undefined}>{s.name}</li>
        ))}
      </ol>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <section className="config-card" aria-labelledby="campos">
        <h2 id="campos" className="config-card-title">Campos</h2>
        <RecordForm fields={fields} values={record.data.custom} action={guardar} />
      </section>
      <ActivityLog items={activity.ok ? activity.data : []} action={nota} />
    </main>
  );
}
