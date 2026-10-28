// Importar a una app: subir un archivo (CSV, Excel, PDF o foto) y el historial con Deshacer. Solo el dueño.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findOwnerMembership, getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { getAppMeta } from "@/server/apps/records.ts";
import { createImportJob, IMPORTABLE, listImports, undoImport } from "@/server/import/jobs.ts";

const ESTADO = { borrador: "Sin terminar", importado: "Importado", deshecho: "Deshecho" } as const;

export default async function Importar({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; app: string }>;
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { org: orgId, app } = await params;
  const { error, aviso } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const meta = await getAppMeta(orgId, app);
  if (!meta || !IMPORTABLE(meta) || !(await findOwnerMembership(me.userId, orgId))) notFound();
  const history = await listImports(me.userId, orgId, app);
  const base = `/${orgId}/a/${app}/importar`;

  async function leer(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const file = formData.get("archivo");
    if (!(file instanceof File) || file.size === 0) redirect(`${base}?error=${encodeURIComponent("Elige un archivo.")}`);
    const r = await createImportJob(actor, orgId, app, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    if (!r.ok) redirect(`${base}?error=${encodeURIComponent(r.error.message)}`);
    redirect(`${base}/${r.data.jobId}`);
  }

  async function deshacer(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await undoImport(actor, orgId, formData.get("job")?.toString() ?? "");
    if (!r.ok) redirect(`${base}?error=${encodeURIComponent(r.error.message)}`);
    const { removed, kept } = r.data;
    const quedan = kept.edited + kept.withActivity;
    redirect(`${base}?aviso=${encodeURIComponent(`Se quitaron ${removed}.${quedan ? ` Se quedaron ${quedan} porque ya tenían cambios o ventas.` : ""}`)}`);
  }

  return (
    <main className="config-page view-page">
      <p className="config-hint"><Link href={`/${orgId}/a/${app}`}>Volver a {meta.name}</Link></p>
      <h1 className="config-title">Importar a {meta.name}</h1>
      <p className="config-hint">Sube tu lista en CSV, Excel, PDF o una foto. Antes de crear nada te enseñamos cómo quedó.</p>
      {error && <p className="invite-error" role="alert">{error}</p>}
      {aviso && <p className="config-hint" role="status">{aviso}</p>}
      <form action={leer} className="config-form config-form-stack config-card" aria-label="Subir archivo">
        <label className="permiso-field">
          <span>Archivo</span>
          <input type="file" name="archivo" required accept=".csv,.xlsx,.pdf,image/png,image/jpeg,image/webp" className="config-input" aria-describedby="archivo-ayuda" />
        </label>
        <p id="archivo-ayuda" className="config-hint">Hasta 5 MB y 5,000 filas.</p>
        <button type="submit" className="panel-cta">Leer archivo</button>
      </form>

      <h2 className="config-title">Tus importaciones</h2>
      {history.ok && history.data.length > 0 ? (
        <table className="config-table">
          <thead>
            <tr><th scope="col">Archivo</th><th scope="col">Fecha</th><th scope="col">Estado</th><th scope="col">Importados</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
          </thead>
          <tbody>
            {history.data.map((h) => (
              <tr key={h.id}>
                <td>{h.status === "borrador" ? <Link href={`${base}/${h.id}`}>{h.fileName}</Link> : h.fileName}</td>
                <td>{h.createdAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</td>
                <td>{ESTADO[h.status]}</td>
                <td>{h.importedCount}</td>
                <td>
                  {h.status === "importado" && (
                    <form action={deshacer}>
                      <input type="hidden" name="job" value={h.id} />
                      <button type="submit" className="panel-btn-ghost" aria-label={`Deshacer la importación de ${h.fileName}`}>Deshacer</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="config-hint">Todavía no importas nada aquí.</p>
      )}
    </main>
  );
}
