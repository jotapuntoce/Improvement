// Marca del dueño: el giro (con el giro libre cuando es "otro") y el tema de su empresa. Solo el dueño
// entra; a cualquier otro, 404. El tema se guarda solo si pasa AA (server/companies/theme.ts).
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { updateCompanyIndustry } from "@/server/companies/mutations.ts";
import { loadBrand, setIndustryCustom, setOrgTheme } from "@/server/companies/theme.ts";
import { INDUSTRIES, INDUSTRY_CATEGORIES } from "@jotapuntoce/ui/building/industries.ts";

// Los valores base de packages/ui/src/tokens.css (--bg, --text-primary, --accent-1, --accent-2): con
// qué arranca el formulario cuando la empresa no tiene tema propio.
const BASE_THEME = { bg: "#05060b", textPrimary: "#f4f6fb", accent1: "#7c5cff", accent2: "#22d3ee" };

const THEME_FIELDS = [
  { name: "bg", label: "Fondo" },
  { name: "textPrimary", label: "Texto principal" },
  { name: "accent1", label: "Acento 1" },
  { name: "accent2", label: "Acento 2" },
] as const;

const FIELD_LABEL: Record<string, string> = Object.fromEntries(THEME_FIELDS.map((f) => [f.name, f.label]));

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

function done(pagina: string, error?: string): never {
  if (error) redirect(`${pagina}?error=${encodeURIComponent(error)}`);
  revalidatePath(pagina, "layout");
  redirect(pagina);
}

export default async function MarcaPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const userId = await getSessionUserId();
  if (!userId) notFound();
  const brand = await loadBrand(userId, orgId);
  if (!brand) notFound();

  const pagina = `/${orgId}/marca`;
  const theme = brand.theme ?? BASE_THEME;
  const industry = brand.industry ?? "otro";

  async function guardarGiro(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const res = await updateCompanyIndustry(actor, orgId, field(formData, "industry"));
    done(pagina, res.ok ? undefined : res.error.message);
  }

  async function guardarGiroLibre(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const res = await setIndustryCustom(actor, orgId, field(formData, "industryCustom"));
    done(pagina, res.ok ? undefined : res.error.message);
  }

  async function guardarTema(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const res = await setOrgTheme(
      actor,
      orgId,
      Object.fromEntries(THEME_FIELDS.map((f) => [f.name, field(formData, f.name)])),
    );
    if (res.ok) done(pagina);
    const err = res.error;
    done(
      pagina,
      err.code === "CONTRAST"
        ? err.issues.map((i) => `${FIELD_LABEL[i.field]}: Contraste ${i.ratio.toFixed(2)}:1 — mínimo 4.5:1`).join(" · ")
        : err.message,
    );
  }

  async function usarBase() {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const res = await setOrgTheme(actor, orgId, null);
    done(pagina, res.ok ? undefined : res.error.message);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Marca</h1>
      {error && (
        <p role="alert" className="invite-error">
          {error}
        </p>
      )}

      <form action={guardarGiro} className="config-form config-card" aria-label="Giro">
        <h2 className="config-card-title">Giro</h2>
        <label className="permiso-field">
          <span>¿Cuál es el giro de tu empresa?</span>
          <select name="industry" defaultValue={industry} className="config-input">
            {INDUSTRY_CATEGORIES.map((c) => (
              <optgroup key={c.id} label={c.label}>
                {INDUSTRIES.filter((i) => i.category === c.id).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="submit" className="panel-cta">
          Guardar giro
        </button>
      </form>

      {industry === "otro" && (
        <form action={guardarGiroLibre} className="config-form config-card" aria-label="Giro libre">
          <label className="permiso-field">
            <span>¿A qué se dedica tu empresa?</span>
            <input
              name="industryCustom"
              required
              maxLength={80}
              defaultValue={brand.industryCustom ?? ""}
              className="config-input"
            />
          </label>
          <button type="submit" className="panel-cta">
            Guardar
          </button>
        </form>
      )}

      <section className="config-card" aria-labelledby="tema">
        <h2 id="tema" className="config-card-title">
          Tema
        </h2>
        <p className="config-hint">El texto y los acentos necesitan contraste de al menos 4.5:1 contra el fondo.</p>
        <form action={guardarTema} className="config-form" aria-label="Tema">
          {THEME_FIELDS.map((f) => (
            <label key={f.name} className="permiso-field">
              <span>{f.label}</span>
              <input type="color" name={f.name} defaultValue={theme[f.name]} className="config-input" />
            </label>
          ))}
          <button type="submit" className="panel-cta">
            Guardar tema
          </button>
        </form>
        <form action={usarBase}>
          <button type="submit" className="panel-btn-ghost">
            Usar colores base
          </button>
        </form>
      </section>
    </main>
  );
}
