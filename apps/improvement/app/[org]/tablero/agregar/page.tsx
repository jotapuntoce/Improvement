// Agregar una tarjeta al tablero: primero qué tipo y de qué app (recarga con ?tipo=&app= para traer sus
// campos y etapas), luego sus opciones. addCard valida que la persona vea lo que pide.
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { addCard } from "@/server/dashboard/cards.ts";
import { listFields } from "@/server/apps/fields.ts";
import { listRecords } from "@/server/apps/records.ts";
import { loadSidebar } from "@/server/apps/sidebar.ts";
import { listOrgKpis } from "@/server/kpis/loadKpis.ts";

const TIPOS: Record<string, { label: string; app: boolean; owner?: boolean }> = {
  numero: { label: "Número", app: true },
  barras: { label: "Barras", app: true },
  embudo: { label: "Embudo por etapa", app: true },
  lista: { label: "Lista de registros", app: true },
  hoy: { label: "Lo que toca hoy", app: false },
  alertas: { label: "Alertas", app: false },
  momentos: { label: "Momentos importantes", app: false },
  ingresos_meta: { label: "Ingresos del mes contra meta", app: false, owner: true },
  pronostico: { label: "Pronóstico de ventas", app: false, owner: true },
  que_falta: { label: "Qué falta en tu proceso", app: false, owner: true },
};

/** Lo que el formulario mandó, con la forma de cardInput. Lo vacío se omite. */
function build(f: FormData) {
  const v = (k: string) => f.get(k)?.toString().trim() ?? "";
  const kind = v("kind");
  const app = v("app");
  const title = v("title") || undefined;
  const opt = (k: string) => v(k) || undefined;
  switch (kind) {
    case "numero":
      return { kind, title, config: v("kpi") ? { kpiId: v("kpi") } : { app, op: v("op") || "contar", field: opt("field"), stage: opt("stage") } };
    case "barras": return { kind, title, config: { app, by: v("by") || "etapa" } };
    case "embudo": return { kind, title, config: { app } };
    case "lista": return { kind, title, config: { app, stage: opt("stage") } };
    case "ingresos_meta": return { kind, title, config: { goals: v("goal") ? { total: Math.round(Number(v("goal")) * 100) } : {} } };
    default: return { kind, title, config: {} };
  }
}

export default async function AgregarTarjeta({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ tipo?: string; app?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { tipo, app, error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const isOwner = me.role === "owner";
  const tipos = Object.entries(TIPOS).filter(([, t]) => isOwner || !t.owner);
  const elegido = tipos.find(([k]) => k === tipo);
  const apps = (await loadSidebar(me.userId, orgId)).groups.flatMap((g) => g.apps);
  const chosenApp = apps.find((a) => a.key === app);
  const listo = elegido && (!elegido[1].app || chosenApp);
  const [records, fields, kpis] = chosenApp
    ? await Promise.all([listRecords(me.userId, orgId, chosenApp.key), listFields(me.userId, orgId, chosenApp.key), isOwner && tipo === "numero" ? listOrgKpis(orgId) : []])
    : [null, [], isOwner && tipo === "numero" ? await listOrgKpis(orgId) : []];
  const stages = records?.ok ? records.data.stages : [];
  const numericos = fields.filter((f) => f.type === "numero" || f.type === "dinero");
  const opciones = fields.filter((f) => f.type === "opcion");

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await addCard(actor, orgId, build(formData));
    if (!r.ok) redirect(`/${orgId}/tablero/agregar?tipo=${formData.get("kind")}&app=${formData.get("app") ?? ""}&error=${encodeURIComponent(r.error.message)}`);
    redirect(`/${orgId}`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Agregar tarjeta</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form method="get" className="config-form task-inline config-card" aria-label="Elegir tarjeta">
        <label className="permiso-field">
          <span>Tipo</span>
          <select name="tipo" defaultValue={elegido?.[0] ?? ""} className="config-input">
            <option value="" disabled>Elige un tipo</option>
            {tipos.map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
        </label>
        <label className="permiso-field">
          <span>App (si la tarjeta es de una app)</span>
          <select name="app" defaultValue={chosenApp?.key ?? ""} className="config-input">
            <option value="">—</option>
            {apps.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
        </label>
        <button type="submit" className="panel-btn-ghost">Elegir</button>
      </form>
      {elegido && !listo && <p className="config-hint">Esta tarjeta es de una app: elige cuál.</p>}
      {listo && (
        <form action={guardar} className="config-form config-form-stack config-card" aria-label="Opciones de la tarjeta">
          <input type="hidden" name="kind" value={elegido[0]} />
          <input type="hidden" name="app" value={chosenApp?.key ?? ""} />
          <label className="permiso-field">
            <span>Título (opcional)</span>
            <input name="title" maxLength={60} className="config-input" />
          </label>
          {tipo === "numero" && (
            <>
              {kpis.length > 0 && (
                <label className="permiso-field">
                  <span>Indicador de la empresa (o deja vacío y cuenta o suma la app)</span>
                  <select name="kpi" className="config-input">
                    <option value="">—</option>
                    {kpis.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </label>
              )}
              <label className="permiso-field">
                <span>Qué hacer</span>
                <select name="op" className="config-input">
                  <option value="contar">Contar registros</option>
                  <option value="sumar">Sumar un campo</option>
                </select>
              </label>
              <label className="permiso-field">
                <span>Campo a sumar</span>
                <select name="field" className="config-input">
                  <option value="monto">Monto</option>
                  {numericos.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>
            </>
          )}
          {tipo === "barras" && (
            <label className="permiso-field">
              <span>Agrupar por</span>
              <select name="by" className="config-input">
                <option value="etapa">Etapa</option>
                {opciones.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
          )}
          {(tipo === "numero" || tipo === "lista") && (
            <label className="permiso-field">
              <span>Solo la etapa (opcional)</span>
              <select name="stage" className="config-input">
                <option value="">Todas</option>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </label>
          )}
          {tipo === "ingresos_meta" && (
            <label className="permiso-field">
              <span>Meta del mes (pesos)</span>
              <input name="goal" type="number" min={0} step="0.01" className="config-input" />
            </label>
          )}
          <button type="submit" className="panel-cta">Agregar</button>
        </form>
      )}
    </main>
  );
}
