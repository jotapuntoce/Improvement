// Beneficios de la red: publicar premios para el catálogo de PowerUps del muelle y, si eres dueño del
// muelle, decidir si sus barcos ven el catálogo global o solo el de la red. Sin acceso: 404.
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { listNetworkBenefits, publishBenefit, setBenefitActive, setCatalogMode } from "@/server/benefits/benefits.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

function done(base: string, r: Result<unknown>): never {
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

async function actor() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return userId;
}

export default async function BeneficiosPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/red/${muelleId}/beneficios`;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(base)}`);
  const view = await listNetworkBenefits(userId, muelleId);

  async function publicar(formData: FormData) {
    "use server";
    const raw = formData.get("as")?.toString() ?? "";
    const [as, barcoOrgId] = raw.split(":");
    done(
      base,
      await publishBenefit(await actor(), muelleId, {
        as,
        barcoOrgId: barcoOrgId || null,
        category: formData.get("category")?.toString(),
        discountDescription: formData.get("discountDescription")?.toString(),
        redemptionInstructions: formData.get("redemptionInstructions")?.toString(),
        pointsCost: Number(formData.get("pointsCost")),
      }),
    );
  }

  async function activar(formData: FormData) {
    "use server";
    done(base, await setBenefitActive(await actor(), formData.get("benefitId")?.toString() ?? "", formData.get("active") === "true"));
  }

  async function catalogo(formData: FormData) {
    "use server";
    done(base, await setCatalogMode(await actor(), muelleId, formData.get("mode")));
  }

  const publishAs = [
    ...(view.canPublishAsAffiliate ? [{ value: "afiliada", label: "Como afiliada" }] : []),
    ...view.barcos.map((b) => ({ value: `negocio:${b.id}`, label: `Como negocio · ${b.name}` })),
  ];

  return (
    <main style={{ padding: "24px" }}>
      <h1>Beneficios de la red</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}

      {view.isDockOwner && (
        <section aria-labelledby="catalogo">
          <h2 id="catalogo">Catálogo de PowerUps</h2>
          <p>
            En <strong>global</strong>, los empleados de los barcos canjean el catálogo general de siempre. En{" "}
            <strong>solo red</strong>, ven y canjean únicamente los beneficios publicados aquí. Puedes volver a global cuando
            quieras: el catálogo general no se borra.
          </p>
          <form action={catalogo}>
            <label>
              <input type="radio" name="mode" value="global" defaultChecked={view.catalogMode === "global"} /> Global
            </label>
            <label>
              <input type="radio" name="mode" value="red" defaultChecked={view.catalogMode === "red"} /> Solo red
            </label>
            <button type="submit">Guardar catálogo</button>
          </form>
        </section>
      )}

      {publishAs.length > 0 && (
        <section aria-labelledby="publicar">
          <h2 id="publicar">Publicar un beneficio</h2>
          <form action={publicar}>
            <label>
              Publicar
              <select name="as" required>
                {publishAs.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>Categoría <input name="category" required minLength={2} maxLength={60} /></label>
            <label>Beneficio <input name="discountDescription" required minLength={3} maxLength={300} /></label>
            <label>Cómo se canjea <input name="redemptionInstructions" required minLength={3} maxLength={500} /></label>
            <label>Puntos <input name="pointsCost" type="number" required min={1} max={100000} /></label>
            <button type="submit">Publicar beneficio</button>
          </form>
        </section>
      )}

      <h2>Publicados</h2>
      <ul>
        {view.benefits.map((b) => (
          <li key={b.id}>
            {b.discountDescription} · {b.businessName} · {b.category} · {b.pointsCost} puntos · {b.isActive ? "Activo" : "Inactivo"}
            {b.canToggle && (
              <form action={activar} style={{ display: "inline-flex" }}>
                <input type="hidden" name="benefitId" value={b.id} />
                <input type="hidden" name="active" value={String(!b.isActive)} />
                <button type="submit">{b.isActive ? "Desactivar" : "Activar"}</button>
              </form>
            )}
          </li>
        ))}
        {view.benefits.length === 0 && <li>Aún no hay beneficios de la red.</li>}
      </ul>
    </main>
  );
}
