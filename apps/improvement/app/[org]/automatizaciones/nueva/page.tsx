// Nueva automatización, por pasos en una sola página: primero la app (recarga con ?app= para traer sus
// etapas y campos), luego Cuando / Y si / Entonces. El servidor arma la regla y la valida con
// ruleSchema; nace en prueba.
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { listFields } from "@/server/apps/fields.ts";
import { listRecords } from "@/server/apps/records.ts";
import { loadSidebar } from "@/server/apps/sidebar.ts";
import { createRule } from "@/server/automations/rules.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

const TRIGGERS = { creado: "Se crea un registro", etapa: "Pasa a la etapa", campo: "Cambia el campo", fecha: "Por la fecha del campo", sin_actividad: "Lleva días sin actividad" };
const OPS = { es: "es", no_es: "no es", mayor: "es mayor que", menor: "es menor que", vacio: "está vacío", no_vacio: "no está vacío" };
const ACTIONS = {
  crear_tarea: "Crear una tarea",
  crear_objetivo: "Crear un objetivo",
  avisar: "Avisar a alguien",
  mover_etapa: "Mover de etapa",
  crear_registro: "Crear un registro en otra app",
  experiencia_lealtad: "Registrar una experiencia de lealtad",
};
const SLOTS = [0, 1, 2];

/** Lo que el formulario mandó, ya con la forma de ruleSchema. Lo vacío se omite. */
function build(f: FormData, app: string) {
  const v = (k: string) => f.get(k)?.toString().trim() ?? "";
  const n = (k: string) => (v(k) === "" ? undefined : Number(v(k)));
  const type = v("trigger");
  const trigger =
    type === "etapa" ? { type, to: v("trigger_stage") || undefined }
    : type === "campo" ? { type, field: v("trigger_field") }
    : type === "fecha" ? { type, field: v("trigger_field"), days: n("trigger_days") ?? 0 }
    : type === "sin_actividad" ? { type, days: n("trigger_days") }
    : { type };
  const conditions = SLOTS.filter((i) => v(`c${i}_field`)).map((i) => ({
    field: v(`c${i}_field`),
    op: v(`c${i}_op`),
    value: v(`c${i}_value`) === "" ? undefined : Number.isNaN(Number(v(`c${i}_value`))) ? v(`c${i}_value`) : Number(v(`c${i}_value`)),
  }));
  const actions = SLOTS.filter((i) => v(`a${i}_type`)).map((i) => {
    const t = v(`a${i}_type`);
    const text = v(`a${i}_text`);
    const person = v(`a${i}_person`);
    switch (t) {
      case "crear_tarea": return { type: t, assigneeId: person, title: text, dueInDays: n(`a${i}_days`) };
      case "crear_objetivo": return { type: t, assigneeId: person, title: text, impactWeight: n(`a${i}_weight`) ?? 10, dueInDays: n(`a${i}_days`) ?? 7 };
      case "avisar": return { type: t, userId: person, text, channel: v(`a${i}_channel`) || "in_app" };
      case "mover_etapa": return { type: t, stage: v(`a${i}_stage`) };
      case "crear_registro": return { type: t, app: v(`a${i}_app`), title: text };
      default: return { type: t, title: text };
    }
  });
  return { name: v("name"), appKey: app, trigger, conditions, actions };
}

export default async function NuevaAutomatizacion({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ app?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { app, error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  if (me.role !== "owner") notFound();
  const sidebar = await loadSidebar(me.userId, orgId);
  const apps = sidebar.groups.flatMap((g) => g.apps);
  const chosen = apps.find((a) => a.key === app);
  const [records, fields, team] = chosen
    ? await Promise.all([listRecords(me.userId, orgId, chosen.key), listFields(me.userId, orgId, chosen.key), listTeammates(me.userId, orgId)])
    : [null, [], []];
  const stages = records?.ok ? records.data.stages : [];
  const fieldOptions = [{ key: "etapa", label: "Etapa" }, { key: "titulo", label: "Nombre" }, ...fields.map((f) => ({ key: f.key, label: f.label }))];

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor || !chosen) notFound();
    const r = await createRule(actor, orgId, build(formData, chosen.key));
    if (!r.ok) redirect(`/${orgId}/automatizaciones/nueva?app=${chosen.key}&error=${encodeURIComponent(r.error.message)}`);
    redirect(`/${orgId}/automatizaciones/${r.data.id}`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Nueva automatización</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form method="get" className="config-form task-inline config-card" aria-label="Elegir app">
        <label className="permiso-field">
          <span>1. ¿En qué app?</span>
          <select name="app" defaultValue={chosen?.key ?? ""} className="config-input">
            <option value="" disabled>Elige una app</option>
            {apps.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
        </label>
        <button type="submit" className="panel-btn-ghost">Elegir</button>
      </form>
      {chosen && (
        <form action={guardar} className="config-form config-form-stack config-card" aria-label="Regla">
          <label className="permiso-field">
            <span>Nombre</span>
            <input name="name" required maxLength={80} className="config-input" />
          </label>
          <fieldset className="config-form-stack">
            <legend>2. Cuando</legend>
            <label className="permiso-field">
              <span>Pasa esto</span>
              <select name="trigger" className="config-input">
                {Object.entries(TRIGGERS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <label className="permiso-field">
              <span>Etapa (si pasa a una etapa)</span>
              <select name="trigger_stage" className="config-input">
                <option value="">Cualquiera</option>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </label>
            <label className="permiso-field">
              <span>Campo (si cambia o por su fecha)</span>
              <select name="trigger_field" className="config-input">
                <option value="">—</option>
                {fieldOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label className="permiso-field">
              <span>Días (negativo = antes de la fecha)</span>
              <input name="trigger_days" type="number" min={-365} max={365} className="config-input" />
            </label>
          </fieldset>
          <fieldset className="config-form-stack">
            <legend>3. Y si (opcional)</legend>
            {SLOTS.map((i) => (
              <div key={i} className="task-inline">
                <select name={`c${i}_field`} aria-label={`Condición ${i + 1}: campo`} className="config-input">
                  <option value="">—</option>
                  {fieldOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select name={`c${i}_op`} aria-label={`Condición ${i + 1}: cómo`} className="config-input">
                  {Object.entries(OPS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <input name={`c${i}_value`} aria-label={`Condición ${i + 1}: valor`} maxLength={200} className="config-input" />
              </div>
            ))}
          </fieldset>
          <fieldset className="config-form-stack">
            <legend>4. Entonces</legend>
            {SLOTS.map((i) => (
              <div key={i} className="config-form-stack">
                <select name={`a${i}_type`} aria-label={`Acción ${i + 1}`} required={i === 0} className="config-input">
                  <option value="">{i === 0 ? "Elige qué hacer" : "— (ninguna)"}</option>
                  {Object.entries(ACTIONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <div className="task-inline">
                  <input name={`a${i}_text`} aria-label={`Acción ${i + 1}: título o texto`} placeholder="Título o texto" maxLength={300} className="config-input" />
                  <select name={`a${i}_person`} aria-label={`Acción ${i + 1}: persona`} className="config-input">
                    <option value="">Persona</option>
                    {team.map((t) => <option key={t.userId} value={t.userId}>{t.fullName ?? t.email}</option>)}
                  </select>
                  <select name={`a${i}_stage`} aria-label={`Acción ${i + 1}: etapa`} className="config-input">
                    <option value="">Etapa</option>
                    {stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                  </select>
                  <select name={`a${i}_app`} aria-label={`Acción ${i + 1}: app destino`} className="config-input">
                    <option value="">App destino</option>
                    {apps.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                  </select>
                  <input name={`a${i}_days`} type="number" min={0} max={365} aria-label={`Acción ${i + 1}: días de plazo`} placeholder="Días de plazo" className="config-input" />
                  <input name={`a${i}_weight`} type="number" min={1} max={100} aria-label={`Acción ${i + 1}: peso del objetivo`} placeholder="Peso (objetivo)" className="config-input" />
                  <select name={`a${i}_channel`} aria-label={`Acción ${i + 1}: canal del aviso`} className="config-input">
                    <option value="in_app">En la app</option>
                    <option value="email">Por correo</option>
                  </select>
                </div>
              </div>
            ))}
          </fieldset>
          <button type="submit" className="panel-cta">Guardar en prueba</button>
        </form>
      )}
    </main>
  );
}
