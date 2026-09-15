// Configuración del dueño: su foto, su nombre, su etiqueta, qué mide cada empresa, el ícono de cada
// empresa y lo que le debe a Improvement.
//
// Una ruta y no un modal: son seis cosas distintas y un diálogo con seis formularios adentro es más
// difícil de usar que una página. Todos los formularios son Server Actions sobre <form> normales —
// esta pantalla no lleva JavaScript propio.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getSessionAccessToken, getSessionUserId } from "@/server/auth/guard.ts";
import {
  getMyProfile,
  updateMyAvatarPath,
  updateMyFullName,
  updateMyOwnerLabel,
} from "@/server/profile/mutations.ts";
import { updateCompanyIndustry } from "@/server/companies/mutations.ts";
import { loadCompanies } from "@/server/companies/loadCompanies.ts";
import { listMyPayments, formatMoney } from "@/server/billing/payments.ts";
import { uploadAvatar } from "@/server/storage/avatar.ts";
import { loadOrgKpis, type KpiCard } from "@/server/kpis/loadKpis.ts";
import { addOrgKpi, removeOrgKpi, updateOrgKpi } from "@/server/kpis/mutations.ts";
import { describeKpi, KPI_SOURCES } from "@/server/kpis/sources.ts";
import { listAreasByOrg, type AreaOption } from "@/server/areas/listAreas.ts";
import { AREA_COLORS, createArea, removeArea, renameArea } from "@/server/areas/mutations.ts";
import { OWNER_LABELS } from "@jotapuntoce/ui/building/ownerLabels.ts";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries.ts";
import { KPI_FORMATS, MAX_KPIS, MIN_KPIS } from "@jotapuntoce/ui/building/kpis.ts";

const dateFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" });

/**
 * La config del adaptador, armada desde un solo selector "detalle" en vez de un editor de JSON.
 *
 * Cada fuente interpreta `detalle` a su manera y las que no lo usan lo ignoran: es un control que
 * cambia de significado según la fuente elegida, que es exactamente lo que pasa con las conexiones —
 * filtrar objetivos por estado y clientes por riesgo no son la misma pregunta.
 */
function buildConfig(source: string, detalle: string, areaId: string): unknown {
  if (source === "objetivos") {
    return { estado: detalle || "abiertos", areaId: areaId || null };
  }
  if (source === "clientes") return { enRiesgo: detalle === "riesgo" };
  return {};
}

function readForm(formData: FormData) {
  const source = formData.get("source")?.toString() ?? "";
  const manual = formData.get("manualValue")?.toString() ?? "";
  return {
    orgId: formData.get("orgId")?.toString() ?? "",
    kpiId: formData.get("kpiId")?.toString() ?? "",
    input: {
      label: formData.get("label")?.toString() ?? "",
      source,
      format: formData.get("format")?.toString() || "numero",
      config: buildConfig(
        source,
        formData.get("detalle")?.toString() ?? "",
        formData.get("areaId")?.toString() ?? "",
      ),
      manualValue: manual === "" ? null : Number(manual),
    },
  };
}

async function guardarNombre(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  await updateMyFullName(id, formData.get("fullName")?.toString() ?? "");
  revalidatePath("/empresas");
}

async function guardarEtiqueta(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  await updateMyOwnerLabel(id, formData.get("ownerLabel")?.toString() ?? "");
  revalidatePath("/empresas");
}

async function guardarIndicador(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const { orgId, kpiId, input } = readForm(formData);
  if (!orgId || !kpiId) return;
  await updateOrgKpi(id, orgId, kpiId, input);
  revalidatePath("/empresas");
  revalidatePath("/empresas/configuracion");
}

async function agregarIndicador(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const { orgId, input } = readForm(formData);
  if (!orgId) return;
  await addOrgKpi(id, orgId, input);
  revalidatePath("/empresas");
  revalidatePath("/empresas/configuracion");
}

async function borrarIndicador(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  const kpiId = formData.get("kpiId")?.toString();
  if (!orgId || !kpiId) return;
  await removeOrgKpi(id, orgId, kpiId);
  revalidatePath("/empresas");
  revalidatePath("/empresas/configuracion");
}

async function agregarArea(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  if (!orgId) return;
  await createArea(
    id,
    orgId,
    formData.get("name")?.toString() ?? "",
    formData.get("color")?.toString() ?? AREA_COLORS[0]!,
  );
  revalidatePath("/empresas/configuracion");
}

async function guardarArea(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  const areaId = formData.get("areaId")?.toString();
  if (!orgId || !areaId) return;
  await renameArea(id, orgId, areaId, formData.get("name")?.toString() ?? "");
  revalidatePath("/empresas/configuracion");
}

async function borrarArea(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  const areaId = formData.get("areaId")?.toString();
  if (!orgId || !areaId) return;
  await removeArea(id, orgId, areaId);
  revalidatePath("/empresas/configuracion");
}

async function guardarIcono(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  if (!orgId) return;
  await updateCompanyIndustry(id, orgId, formData.get("industry")?.toString() ?? "");
  revalidatePath("/empresas");
}

async function guardarFoto(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  const token = await getSessionAccessToken();
  if (!id || !token) return;

  const file = formData.get("foto");
  if (!(file instanceof File) || file.size === 0) return;

  const uploaded = await uploadAvatar(id, token, file);
  if (!uploaded.ok) return;

  await updateMyAvatarPath(id, uploaded.data);
  revalidatePath("/empresas");
}

function detalleOf(kpi: Pick<KpiCard, "source" | "config">): string {
  const c = (kpi.config ?? {}) as { estado?: string; enRiesgo?: boolean };
  if (kpi.source === "objetivos") return c.estado ?? "abiertos";
  if (kpi.source === "clientes") return c.enRiesgo ? "riesgo" : "todos";
  return "";
}

function areaOf(kpi: Pick<KpiCard, "config">): string {
  return ((kpi.config ?? {}) as { areaId?: string | null }).areaId ?? "";
}

/** Los campos que comparten el alta y la edición — el alta va con una fila vacía. */
function KpiFields({ kpi, areas }: { kpi?: KpiCard; areas: AreaOption[] }) {
  return (
    <>
      <input
        name="label"
        defaultValue={kpi?.label ?? ""}
        placeholder="Cómo se llama"
        required
        className="config-input"
      />
      <select name="source" defaultValue={kpi?.source ?? "manual"} className="config-input">
        {KPI_SOURCES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {/* Un solo selector de detalle para todas las fuentes: sin JavaScript no se puede esconder el
          que no aplica, y las opciones dicen a qué fuente pertenecen. La fuente elegida decide cuál
          se usa (buildConfig) — las demás se ignoran al guardar. */}
      <select name="detalle" defaultValue={kpi ? detalleOf(kpi) : ""} className="config-input">
        <option value="">Sin detalle</option>
        <option value="abiertos">Objetivos: abiertos</option>
        <option value="completados">Objetivos: completados</option>
        <option value="vencidos">Objetivos: vencidos</option>
        <option value="todos">Clientes: todos</option>
        <option value="riesgo">Clientes: en riesgo</option>
      </select>
      <select name="areaId" defaultValue={kpi ? areaOf(kpi) : ""} className="config-input">
        <option value="">Toda la empresa</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            Solo el área {a.name}
          </option>
        ))}
      </select>
      <select name="format" defaultValue={kpi?.format ?? "numero"} className="config-input">
        {KPI_FORMATS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <input
        name="manualValue"
        type="number"
        defaultValue={kpi?.manualValue ?? ""}
        placeholder="Valor (si es a mano)"
        className="config-input"
      />
    </>
  );
}

export default async function ConfiguracionPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const [profile, companies, payments] = await Promise.all([
    getMyProfile(userId),
    loadCompanies(userId),
    listMyPayments(userId),
  ]);
  if (!profile) redirect("/login");

  const orgIds = companies.map((c) => c.orgId);
  const [kpisByOrg, areasByOrg] = await Promise.all([loadOrgKpis(orgIds), listAreasByOrg(orgIds)]);

  const pending = payments.filter((p) => !p.paidAt);
  const paid = payments.filter((p) => p.paidAt);

  return (
    <main className="config-page">
      <Link href="/empresas" className="jpc-back-link jpc-back-link--fixed">
        ← Volver al panel
      </Link>

      <h1 className="config-title">Configuración</h1>

      <section className="config-card">
        <h2 className="config-card-title">Tu foto</h2>
        <form action={guardarFoto} className="config-form">
          {profile.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- ver OwnerHeader.tsx
            <img src={profile.avatarUrl} alt="Tu foto actual" className="config-avatar-preview" />
          )}
          <input
            type="file"
            name="foto"
            accept="image/jpeg,image/png,image/webp"
            required
            className="config-input"
          />
          <button type="submit" className="panel-cta">Subir</button>
        </form>
        <p className="config-hint">JPG, PNG o WebP. Máximo 2 MB.</p>
      </section>

      <section className="config-card">
        <h2 className="config-card-title">Tu nombre</h2>
        <form action={guardarNombre} className="config-form">
          <input
            name="fullName"
            defaultValue={profile.fullName ?? ""}
            placeholder="Tu nombre y apellido"
            required
            className="config-input"
          />
          <button type="submit" className="panel-cta">Guardar</button>
        </form>
      </section>

      <section className="config-card">
        <h2 className="config-card-title">Tu etiqueta</h2>
        <form action={guardarEtiqueta} className="config-form">
          <select name="ownerLabel" defaultValue={profile.ownerLabel ?? ""} className="config-input">
            <option value="">Sin etiqueta</option>
            {OWNER_LABELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <button type="submit" className="panel-cta">Guardar</button>
        </form>
      </section>

      {companies.map((c) => {
        const kpis = kpisByOrg.get(c.orgId) ?? [];
        const areas = areasByOrg.get(c.orgId) ?? [];
        return [
          <section key={`${c.orgId}-kpis`} className="config-card">
            <h2 className="config-card-title">Qué mide {c.name}</h2>
            <p className="config-hint">
              Entre {MIN_KPIS} y {MAX_KPIS} indicadores. Cada uno dice de dónde sale su número: si
              todavía no hay de dónde sacarlo, déjalo en “Capturado a mano” y cámbialo cuando exista.
            </p>

            {kpis.map((kpi) => (
              <form key={kpi.id} action={guardarIndicador} className="config-kpi-row">
                <input type="hidden" name="orgId" value={c.orgId} />
                <input type="hidden" name="kpiId" value={kpi.id} />
                <KpiFields kpi={kpi} areas={areas} />
                <button type="submit" className="panel-cta">Guardar</button>
                <button type="submit" formAction={borrarIndicador} className="panel-btn-ghost">
                  Borrar
                </button>
                <p className="config-kpi-conn">
                  Conectado a: {describeKpi(kpi, areas.find((a) => a.id === areaOf(kpi))?.name)}
                </p>
              </form>
            ))}

            {kpis.length < MAX_KPIS && (
              <form action={agregarIndicador} className="config-kpi-row config-kpi-row--new">
                <input type="hidden" name="orgId" value={c.orgId} />
                <KpiFields areas={areas} />
                <button type="submit" className="panel-cta">Agregar</button>
              </form>
            )}
          </section>,
          <section key={`${c.orgId}-areas`} className="config-card">
            <h2 className="config-card-title">Las áreas de {c.name}</h2>
            <p className="config-hint">
              Cada persona que invites elige una de estas al entrar. Son también las que filtran tus
              indicadores y lo que cada quien puede ver.
            </p>

            {areas.map((areaOption) => (
              <form key={areaOption.id} action={guardarArea} className="config-area-row">
                <input type="hidden" name="orgId" value={c.orgId} />
                <input type="hidden" name="areaId" value={areaOption.id} />
                <input
                  name="name"
                  defaultValue={areaOption.name}
                  aria-label={`Nombre del área ${areaOption.name}`}
                  className="config-input"
                />
                <button type="submit" className="panel-cta">Guardar</button>
                <button type="submit" formAction={borrarArea} className="panel-btn-ghost config-btn--danger">
                  Borrar
                </button>
              </form>
            ))}

            <form action={agregarArea} className="config-area-row config-area-row--new">
              <input type="hidden" name="orgId" value={c.orgId} />
              <input name="name" placeholder="Nombre del área nueva" required className="config-input" />
              <select name="color" defaultValue={AREA_COLORS[0]} aria-label="Color del área nueva" className="config-input">
                {AREA_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
              <button type="submit" className="panel-cta">Agregar área</button>
            </form>
          </section>,
        ];
      })}

      {companies.length > 0 && (
        <section className="config-card">
          <h2 className="config-card-title">El ícono de tus empresas</h2>
          <p className="config-hint">El ícono cambia según el giro que elijas.</p>
          {companies.map((c) => (
            <form key={c.orgId} action={guardarIcono} className="config-form">
              <input type="hidden" name="orgId" value={c.orgId} />
              <span className="config-company-name">{c.name}</span>
              <select name="industry" defaultValue={c.industry ?? "otro"} className="config-input">
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="panel-cta">Guardar</button>
            </form>
          ))}
        </section>
      )}

      <section className="config-card">
        <h2 className="config-card-title">Tus pagos con Improvement</h2>
        {payments.length === 0 ? (
          <p className="config-hint">No tienes pagos registrados todavía.</p>
        ) : (
          <>
            {pending.length > 0 && (
              <table className="config-table">
                <caption className="config-table-caption">Pendientes</caption>
                <thead>
                  <tr>
                    <th scope="col">Concepto</th>
                    <th scope="col">Empresa</th>
                    <th scope="col">Se cobra</th>
                    <th scope="col">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id}>
                      <td>{p.concept}</td>
                      <td>{p.orgName}</td>
                      <td>{dateFormat.format(p.dueDate)}</td>
                      <td className="config-amount">{formatMoney(p.amount, p.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {paid.length > 0 && (
              <table className="config-table">
                <caption className="config-table-caption">Pagados</caption>
                <thead>
                  <tr>
                    <th scope="col">Concepto</th>
                    <th scope="col">Empresa</th>
                    <th scope="col">Se pagó</th>
                    <th scope="col">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.map((p) => (
                    <tr key={p.id}>
                      <td>{p.concept}</td>
                      <td>{p.orgName}</td>
                      <td>{p.paidAt ? dateFormat.format(p.paidAt) : ""}</td>
                      <td className="config-amount">{formatMoney(p.amount, p.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </main>
  );
}
