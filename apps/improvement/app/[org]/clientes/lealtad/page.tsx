// Lealtad: funciones del programa, niveles VIP, experiencias entregadas y el enlace al monedero de cada
// cliente (server/crm/loyalty.ts y wallet.ts). Lo ve quien tenga `clientes`; escribe quien la tenga en `empresa`.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { getProgram, grantExperience, LOYALTY_FEATURES, setFeatures, upsertTier } from "@/server/crm/loyalty.ts";
import { issueWalletToken } from "@/server/crm/wallet.ts";
import { listClients } from "@/server/clients/mutations.ts";

const FEATURE_LABEL: Record<(typeof LOYALTY_FEATURES)[number], string> = {
  vip: "Niveles VIP",
  referidos: "Referidos",
  cumpleanos: "Cumpleaños",
  retos: "Retos",
};

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

export default async function LealtadPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const { membership, scope } = await requireSection(orgId, "clientes");
  const userId = membership.userId;
  const program = await getProgram(userId, orgId);
  if (!program.ok) notFound();
  const { features, tiers } = program.data;
  const canWrite = scope === "empresa";
  const clients = canWrite ? (await listClients(userId, orgId, { limit: 100 })).data.clients : [];
  const pagina = `/${orgId}/clientes/lealtad`;
  const base = env.NEXT_PUBLIC_APP_URL ?? "";

  async function guardarFunciones(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await setFeatures(actor, orgId, Object.fromEntries(LOYALTY_FEATURES.map((k) => [k, formData.has(k)]))));
  }

  async function nuevoNivel(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await upsertTier(actor, orgId, {
        name: field(formData, "name"),
        minPurchases: field(formData, "minPurchases") || "0",
        perks: field(formData, "perks"),
        position: field(formData, "position") || "0",
      }),
    );
  }

  async function darExperiencia(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const pesos = Number(field(formData, "value") || "0");
    finish(
      pagina,
      await grantExperience(actor, orgId, {
        clientId: field(formData, "clientId"),
        title: field(formData, "title"),
        valueCents: Math.round(pesos * 100),
        grantedOn: field(formData, "grantedOn"),
      }),
    );
  }

  async function generarEnlace(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await issueWalletToken(actor, orgId, field(formData, "clientId")));
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Lealtad</h1>
      <p className="config-hint">
        <a href={`/${orgId}/clientes`}>Volver a clientes</a>
      </p>
      {error && <p className="invite-error">{error}</p>}

      <form action={guardarFunciones} className="config-form config-card" aria-label="Funciones del programa">
        <h2 className="config-card-title">Funciones del programa</h2>
        {LOYALTY_FEATURES.map((k) => (
          <label key={k} className="permiso-field">
            <input type="checkbox" name={k} defaultChecked={features[k] === true} disabled={!canWrite} />
            <span>{FEATURE_LABEL[k]}</span>
          </label>
        ))}
        {canWrite && (
          <button type="submit" className="panel-cta">
            Guardar funciones
          </button>
        )}
      </form>

      <section className="config-card" aria-labelledby="niveles">
        <h2 id="niveles" className="config-card-title">
          Niveles VIP
        </h2>
        <ul className="equipo-list">
          {tiers.map((t) => (
            <li key={t.id}>
              <strong>{t.name}</strong> · desde {t.minPurchases} {t.minPurchases === 1 ? "compra" : "compras"}
              {t.perks && <> · {t.perks}</>}
            </li>
          ))}
          {tiers.length === 0 && <li className="config-hint">Aún no hay niveles.</li>}
        </ul>
        {canWrite && (
          <form action={nuevoNivel} className="config-form" aria-label="Nuevo nivel">
            <label className="permiso-field">
              <span>Nombre del nivel</span>
              <input name="name" required minLength={2} maxLength={60} className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Compras mínimas</span>
              <input name="minPurchases" type="number" min={0} step={1} defaultValue={0} className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Beneficios</span>
              <input name="perks" maxLength={500} className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Orden</span>
              <input name="position" type="number" step={1} defaultValue={tiers.length} className="config-input" />
            </label>
            <button type="submit" className="panel-cta">
              Agregar nivel
            </button>
          </form>
        )}
      </section>

      {canWrite && (
        <form action={darExperiencia} className="config-form config-card" aria-label="Dar una experiencia">
          <h2 className="config-card-title">Dar una experiencia</h2>
          <label className="permiso-field">
            <span>Cliente</span>
            <select name="clientId" required className="config-input" defaultValue="">
              <option value="" disabled>
                Elige un cliente
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="permiso-field">
            <span>Título</span>
            <input name="title" required minLength={3} maxLength={160} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Valor (MXN)</span>
            <input name="value" type="number" min={0} step="0.01" defaultValue={0} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Fecha</span>
            <input name="grantedOn" type="date" required className="config-input" />
          </label>
          <button type="submit" className="panel-cta">
            Dar experiencia
          </button>
        </form>
      )}

      {canWrite && (
        <section className="config-card" aria-labelledby="monederos">
          <h2 id="monederos" className="config-card-title">
            Monederos
          </h2>
          <ul className="equipo-list">
            {clients.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                {c.walletToken && <p className="config-hint">{`${base}/w/${c.walletToken}`}</p>}
                <form action={generarEnlace}>
                  <input type="hidden" name="clientId" value={c.id} />
                  <button type="submit" className="panel-btn-ghost">
                    Generar enlace del monedero
                  </button>
                </form>
              </li>
            ))}
            {clients.length === 0 && <li className="config-hint">Aún no hay clientes.</li>}
          </ul>
        </section>
      )}
    </main>
  );
}
