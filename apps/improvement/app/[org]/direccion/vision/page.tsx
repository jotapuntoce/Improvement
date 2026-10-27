// La V/TO de la empresa: una tarjeta por sección. El dueño edita cada una con su formulario; quien
// tenga la sección `vision` la lee. 404 y no 403 para los demás (requireSection).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { getVision, updateVisionSection, type VisionSection } from "@/server/direccion/vision/vision.ts";

type FieldKind = "text" | "long" | "list" | "year" | "date";
interface Field {
  name: string;
  label: string;
  kind: FieldKind;
}
interface Card {
  section: VisionSection;
  title: string;
  /** Llave de la vista que getVision devuelve para esta sección. */
  view: "coreValues" | "coreFocus" | "tenYearTarget" | "marketingStrategy" | "threeYearPicture" | "oneYearPlan";
  fields: Field[];
}

// core_values es la única sección que es una lista y no un objeto: su campo `values` se manda solo.
const CARDS: Card[] = [
  { section: "core_values", title: "Valores centrales", view: "coreValues", fields: [{ name: "values", label: "Un valor por línea (máximo 7)", kind: "list" }] },
  {
    section: "core_focus", title: "Enfoque central", view: "coreFocus",
    fields: [{ name: "purpose", label: "Propósito", kind: "long" }, { name: "niche", label: "Nicho", kind: "long" }],
  },
  {
    section: "ten_year_target", title: "Meta a 10 años", view: "tenYearTarget",
    fields: [{ name: "goal", label: "Meta", kind: "long" }, { name: "year", label: "Año", kind: "year" }],
  },
  {
    section: "marketing_strategy", title: "Estrategia de marketing", view: "marketingStrategy",
    fields: [
      { name: "target_market", label: "Mercado objetivo", kind: "long" },
      { name: "uniques", label: "Lo que te hace único, uno por línea (máximo 3)", kind: "list" },
      { name: "proven_process", label: "Proceso probado", kind: "long" },
      { name: "guarantee", label: "Garantía", kind: "text" },
    ],
  },
  {
    section: "three_year_picture", title: "Foto a 3 años", view: "threeYearPicture",
    fields: [
      { name: "date", label: "Fecha", kind: "date" },
      { name: "revenue", label: "Ingresos", kind: "text" },
      { name: "profit", label: "Utilidad", kind: "text" },
      { name: "looks_like", label: "Cómo se ve, una cosa por línea", kind: "list" },
    ],
  },
  {
    section: "one_year_plan", title: "Plan a 1 año", view: "oneYearPlan",
    fields: [
      { name: "date", label: "Fecha", kind: "date" },
      { name: "revenue", label: "Ingresos", kind: "text" },
      { name: "profit", label: "Utilidad", kind: "text" },
      { name: "goals", label: "Metas del año, una por línea (máximo 7)", kind: "list" },
    ],
  },
];

function fromForm(kind: FieldKind, raw: string): unknown {
  if (kind === "list") return raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (kind === "year") return raw.trim() ? Number(raw) : null;
  if (kind === "date") return raw.trim() || null;
  return raw;
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.join("\n");
  return value == null ? "" : String(value);
}

export default async function VisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const { membership } = await requireSection(orgId, "vision");
  const vision = await getVision(membership.userId, orgId);
  if (!vision) notFound();
  const pagina = `/${orgId}/direccion/vision`;

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const card = CARDS.find((c) => c.section === formData.get("section"));
    if (!card) redirect(`${pagina}?error=${encodeURIComponent("Esa sección no existe.")}`);
    const values = Object.fromEntries(
      card.fields.map((f) => [f.name, fromForm(f.kind, formData.get(f.name)?.toString() ?? "")]),
    );
    const input = card.section === "core_values" ? values.values : values;
    const result = await updateVisionSection(actor, orgId, card.section, input);
    if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Visión</h1>
      {error && <p className="invite-error">{error}</p>}

      {CARDS.map((card) => {
        const current = vision[card.view];
        const value = (name: string) =>
          card.section === "core_values" ? current : (current as Record<string, unknown> | null)?.[name];

        if (!vision.canEdit) {
          return (
            <section key={card.section} className="config-card">
              <h2 className="config-card-title">{card.title}</h2>
              <dl>
                {card.fields.map((f) => (
                  <div key={f.name}>
                    <dt className="config-hint">{f.label}</dt>
                    <dd>
                      {Array.isArray(value(f.name)) ? (
                        <ul>
                          {(value(f.name) as string[]).map((v) => (
                            <li key={v}>{v}</li>
                          ))}
                        </ul>
                      ) : (
                        asText(value(f.name)) || "Sin definir"
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        }

        return (
          <form key={card.section} action={guardar} className="config-card">
            <h2 className="config-card-title">{card.title}</h2>
            <input type="hidden" name="section" value={card.section} />
            {card.section === "core_values" && vision.coreValues.length > 0 && (
              <ul>
                {vision.coreValues.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            )}
            {card.fields.map((f) => (
              <label key={f.name} className="permiso-field">
                <span>{f.label}</span>
                {f.kind === "list" || f.kind === "long" ? (
                  <textarea name={f.name} rows={f.kind === "list" ? 4 : 2} className="config-input" defaultValue={asText(value(f.name))} />
                ) : (
                  <input
                    name={f.name}
                    type={f.kind === "year" ? "number" : f.kind === "date" ? "date" : "text"}
                    className="config-input"
                    defaultValue={asText(value(f.name))}
                  />
                )}
              </label>
            ))}
            <div className="permiso-actions">
              <button type="submit" className="panel-cta">
                Guardar {card.title.toLowerCase()}
              </button>
            </div>
          </form>
        );
      })}

      <Link href={`/${orgId}/objetivos`}>← Volver a objetivos</Link>
    </main>
  );
}
