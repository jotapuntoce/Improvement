// Revisar una importación antes de crear nada: qué columna va a qué campo, cómo quedan los
// registros y qué renglones traen error. Nada se importa hasta "Importar N registros".
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { addField } from "@/server/apps/fields.ts";
import { confirmImport, getImportJob, previewImport } from "@/server/import/jobs.ts";

export default async function RevisarImportacion({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; app: string; job: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId, app, job: jobId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const g = await getImportJob(me.userId, orgId, jobId);
  if (!g.ok || g.data.app.key !== app) notFound();
  const { job, fields } = g.data;
  const lista = `/${orgId}/a/${app}/importar`;
  if (job.status !== "borrador") redirect(lista);
  const pagina = `${lista}/${jobId}`;
  // Se recalcula en cada visita con el mapeo guardado: el dueño ve el resultado sin un paso extra.
  const preview = await previewImport(me.userId, orgId, jobId, job.mapping);

  async function mapear(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const mapping: Record<string, string> = {};
    for (const [i, header] of job.headers.entries()) {
      const target = formData.get(`col-${i}`)?.toString() ?? "ignorar";
      if (target !== "nuevo") { mapping[String(i)] = target; continue; }
      const f = await addField(actor, orgId, app, { label: header, type: "texto" });
      if (!f.ok) redirect(`${pagina}?error=${encodeURIComponent(`${header}: ${f.error.message}`)}`);
      mapping[String(i)] = f.data.key;
    }
    const r = await previewImport(actor, orgId, jobId, mapping);
    redirect(r.ok ? pagina : `${pagina}?error=${encodeURIComponent(r.error.message)}`);
  }

  async function importar() {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await confirmImport(actor, orgId, jobId);
    if (!r.ok) redirect(`${pagina}?error=${encodeURIComponent(r.error.message)}`);
    redirect(`/${orgId}/a/${app}?aviso=${encodeURIComponent(`Importados ${r.data.imported}.`)}`);
  }

  const valueText = (v: unknown) => (typeof v === "boolean" ? (v ? "Sí" : "No") : String(v ?? ""));

  return (
    <main className="config-page view-page">
      <p className="config-hint"><Link href={lista}>Volver a importar</Link></p>
      <h1 className="config-title">Así leímos {job.fileName}</h1>
      <p className="config-hint">
        {job.mappedBy === "ia" ? "Improvement propuso a qué campo va cada columna." : "Emparejamos las columnas por su nombre."} Cámbialo si algo no va.
      </p>
      {error && <p className="invite-error" role="alert">{error}</p>}

      <form action={mapear} className="config-form config-form-stack config-card" aria-label="A qué campo va cada columna">
        {job.headers.map((h, i) => (
          <label key={i} className="permiso-field">
            <span>{h}</span>
            <select name={`col-${i}`} defaultValue={job.mapping[String(i)] ?? "ignorar"} className="config-input">
              <option value="titulo">Nombre del registro</option>
              {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              <option value="nuevo">Campo nuevo de texto: {h}</option>
              <option value="ignorar">No importar</option>
            </select>
          </label>
        ))}
        <button type="submit" className="panel-btn-ghost">Actualizar vista previa</button>
      </form>

      {preview.ok && (
        <>
          <h2 className="config-title">{preview.data.valid} listos para importar</h2>
          {preview.data.sample.length > 0 && (
            <table className="config-table">
              <caption className="config-table-caption">Los primeros {preview.data.sample.length}</caption>
              <thead>
                <tr><th scope="col">Nombre</th>{fields.map((f) => <th key={f.key} scope="col">{f.label}</th>)}</tr>
              </thead>
              <tbody>
                {preview.data.sample.map((r, i) => (
                  <tr key={i}><td>{r.title}</td>{fields.map((f) => <td key={f.key}>{valueText(r.values[f.key])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.data.errors.length > 0 && (
            <section aria-labelledby="errores">
              <h2 id="errores" className="config-title">{preview.data.errors.length} renglones con error</h2>
              <p className="config-hint">Estos no se importan. Corrígelos en tu archivo y vuelve a subirlo, o sigue sin ellos.</p>
              <ul className="config-hint">
                {preview.data.errors.slice(0, 100).map((e) => <li key={e.row}>Renglón {e.row}: {e.message}</li>)}
              </ul>
            </section>
          )}
          {preview.data.valid > 0 && (
            <form action={importar}>
              <button type="submit" className="panel-cta">Importar {preview.data.valid} registros</button>
            </form>
          )}
        </>
      )}
      {!preview.ok && <p className="invite-error" role="alert">{preview.error.message}</p>}
    </main>
  );
}
