// Arranque, paso 1 de 4: el negocio. Crea la empresa con quien llega como dueño y sigue con su marca.
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/guard.ts";
import { createOwnBusiness } from "@/server/registro/business.ts";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries.ts";

const SIZES = [["solo", "Solo yo"], ["2-5", "2 a 5"], ["6-20", "6 a 20"], ["21+", "Más de 20"]] as const;
const FIELDS = ["fullName", "name", "industry", "teamSize", "city"] as const;

export default async function Arranque({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await getSessionUser())) redirect("/login?returnTo=/arranque");
  const { error } = await searchParams;

  async function crear(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) notFound();
    const r = await createOwnBusiness(actor, Object.fromEntries(FIELDS.map((k) => [k, formData.get(k)?.toString() ?? ""])));
    if (!r.ok) redirect(`/arranque?error=${encodeURIComponent(r.error.message)}`);
    redirect(`/arranque/${r.data.orgId}/marca`);
  }

  return (
    <main className="config-page auth-page">
      <p className="config-hint">Paso 1 de 4</p>
      <h1 className="config-title">Cuéntanos de tu negocio</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form action={crear} className="config-form config-form-stack config-card" aria-label="Tu negocio">
        <label className="permiso-field"><span>Tu nombre</span><input name="fullName" required maxLength={80} autoComplete="name" className="config-input" /></label>
        <label className="permiso-field"><span>Nombre del negocio</span><input name="name" required maxLength={80} className="config-input" /></label>
        <label className="permiso-field">
          <span>Giro</span>
          <select name="industry" required className="config-input">
            {INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </label>
        <label className="permiso-field">
          <span>¿Cuántos son?</span>
          <select name="teamSize" required className="config-input">
            {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="permiso-field"><span>Ciudad</span><input name="city" required maxLength={60} className="config-input" /></label>
        <button type="submit" className="panel-cta">Seguir</button>
      </form>
    </main>
  );
}
