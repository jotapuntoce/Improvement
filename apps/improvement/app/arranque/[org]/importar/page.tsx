// Arranque, paso 4 de 4: trae lo que ya tienes. El dueño elige a qué app va su lista y la sube (o la
// elige de Drive); el mapeo y la vista previa son los mismos de "Importar" en cada app.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { fetchDriveFile } from "@/server/import/drive.ts";
import { createImportJob, listImportableApps } from "@/server/import/jobs.ts";
import { DrivePicker } from "@/components/import/DrivePicker.tsx";
import { env } from "@/lib/env.ts";

export default async function ArranqueImportar({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const apps = await listImportableApps(me.userId, orgId);
  if (!apps.ok) notFound();
  const { NEXT_PUBLIC_GOOGLE_CLIENT_ID: clientId, NEXT_PUBLIC_GOOGLE_API_KEY: apiKey, NEXT_PUBLIC_GOOGLE_APP_ID: appId } = env;
  const drive = clientId && apiKey && appId ? { clientId, apiKey, appId } : null;

  async function subir(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const back = (message: string) => redirect(`/arranque/${orgId}/importar?error=${encodeURIComponent(message)}`);
    const input = z
      .object({ app: z.string().min(1), fileId: z.string().optional(), token: z.string().optional() })
      .safeParse({ app: formData.get("app"), fileId: formData.get("fileId") || undefined, token: formData.get("token") || undefined });
    if (!input.success) return back("Elige a dónde va tu lista.");
    const { app, fileId, token } = input.data;
    let r;
    if (fileId && token) {
      const file = await fetchDriveFile(fileId, token);
      if (!file.ok) return back(file.error.message);
      const { source, ...uploaded } = file.data;
      r = await createImportJob(actor, orgId, app, uploaded, source ? { source } : {});
    } else {
      const file = formData.get("archivo");
      if (!(file instanceof File) || file.size === 0) return back("Elige un archivo.");
      r = await createImportJob(actor, orgId, app, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    if (!r.ok) return back(r.error.message);
    redirect(`/${orgId}/a/${app}/importar/${r.data.jobId}`);
  }

  return (
    <main className="config-page auth-page">
      <p className="config-hint">Paso 4 de 4</p>
      <h1 className="config-title">Trae lo que ya tienes</h1>
      <p className="config-hint">¿Ya llevas tus clientes o pedidos en Excel, Sheets o papel? Súbelo y lo acomodamos.</p>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form action={subir} className="config-form config-form-stack config-card" aria-label="Subir lo que ya tienes">
        <label className="permiso-field">
          <span>¿A dónde va?</span>
          <select name="app" className="config-input" defaultValue={apps.data[0]?.key}>
            {apps.data.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
        </label>
        <label className="permiso-field">
          <span>Archivo</span>
          <input type="file" name="archivo" accept=".csv,.xlsx,.pdf,image/png,image/jpeg,image/webp" className="config-input" aria-describedby="archivo-ayuda" />
        </label>
        <p id="archivo-ayuda" className="config-hint">CSV, Excel, PDF o una foto. Hasta 5 MB y 5,000 filas.</p>
        <button type="submit" className="panel-cta">Leer archivo</button>
        {drive && <DrivePicker {...drive} />}
      </form>
      <p className="config-hint"><Link href={`/${orgId}`}>No tengo nada, ir a mi Improvement</Link></p>
    </main>
  );
}
