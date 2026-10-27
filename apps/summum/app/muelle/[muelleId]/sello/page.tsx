// Panel del Sello Cénit de los socios: ajustes, requisitos, marcas manuales y la firma de dos socios sobre
// cada evaluación. El puntaje lo calcula Improvement (server/seal/score.ts); aquí solo se lee y se firma.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDockOwnership } from "@/server/auth/guard.ts";
import { listAffiliates } from "@/server/affiliates/affiliates.ts";
import { listDockBarcos } from "@/server/barcos/list.ts";
import { approveEvaluation, listEvaluations, rejectEvaluation } from "@/server/seal/approvals.ts";
import {
  createRequirement,
  getSettings,
  listRequirements,
  markManualResult,
  setRequirementActive,
  upsertSettings,
  type SealSubject,
} from "@/server/seal/requirements.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

const SOURCE_LABEL = { manual: "Manual", kpi: "Indicador" } as const;
const VIGENCIA_LABEL: Record<string, string> = {
  vigente: "Vigente",
  en_riesgo: "En riesgo",
  reevaluacion: "En reevaluación",
  suspendido: "Suspendido",
};

function done(base: string, r: Result<unknown>): never {
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

const num = (formData: FormData, name: string) => {
  const raw = formData.get(name)?.toString().trim();
  return raw ? Number(raw) : null;
};

/** "barco:<id>" o "afiliada:<id>", como viene del select de sujetos. */
function parseSubject(raw: string): SealSubject | null {
  const [kind, id] = raw.split(":");
  if (!id) return null;
  if (kind === "barco") return { kind, orgId: id };
  if (kind === "afiliada") return { kind, affiliateId: id };
  return null;
}

export default async function SelloPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/muelle/${muelleId}/sello`;
  const { userId } = await requireDockOwnership(muelleId, base);
  const [settings, requirements, evaluations, barcos, affiliates] = await Promise.all([
    getSettings(userId, muelleId),
    listRequirements(userId, muelleId),
    listEvaluations(userId, muelleId),
    listDockBarcos(userId, muelleId),
    listAffiliates(userId, muelleId),
  ]);
  const pending = evaluations.filter((e) => e.approvalStatus === "pendiente");
  const approved = evaluations.filter((e) => e.approvalStatus === "aprobada");
  const manual = requirements.filter((r) => r.source === "manual" && r.active);

  async function guardarAjustes(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(
      base,
      await upsertSettings(actor, muelleId, {
        minSealScore: num(formData, "minSealScore"),
        graceDays: num(formData, "graceDays"),
        proposalMinSeverity: num(formData, "proposalMinSeverity"),
      }),
    );
  }

  async function nuevoRequisito(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    const source = formData.get("source")?.toString();
    const config =
      source === "kpi"
        ? {
            source: formData.get("kpiSource")?.toString() ?? "",
            config: {},
            op: formData.get("op")?.toString(),
            threshold: num(formData, "threshold"),
          }
        : {};
    done(
      base,
      await createRequirement(actor, muelleId, {
        code: formData.get("code")?.toString().trim(),
        title: formData.get("title")?.toString(),
        description: formData.get("description")?.toString() ?? "",
        points: num(formData, "points"),
        source,
        config,
      }),
    );
  }

  async function activar(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(base, await setRequirementActive(actor, formData.get("requirementId")?.toString() ?? "", formData.get("active") === "true"));
  }

  async function marcar(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    const subject = parseSubject(formData.get("subject")?.toString() ?? "");
    if (!subject) redirect(`${base}?error=invalido`);
    done(
      base,
      await markManualResult(
        actor,
        formData.get("requirementId")?.toString() ?? "",
        subject,
        formData.get("met") === "on",
        formData.get("evidenceNote")?.toString().trim() || null,
      ),
    );
  }

  async function decidir(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    const id = formData.get("evaluationId")?.toString() ?? "";
    done(base, formData.get("decision") === "aprobar" ? await approveEvaluation(actor, id) : await rejectEvaluation(actor, id));
  }

  return (
    <main>
      <h1>Sello Cénit</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}

      <h2>Ajustes</h2>
      {settings?.minSealScore == null && <p>Sin mínimo definido: nadie se puede certificar todavía.</p>}
      <form action={guardarAjustes}>
        <label>Puntaje mínimo <input name="minSealScore" type="number" min={0} defaultValue={settings?.minSealScore ?? ""} /></label>
        <label>Días de gracia <input name="graceDays" type="number" min={1} max={365} required defaultValue={settings?.graceDays ?? 30} /></label>
        <label>
          Severidad para proponer especialistas
          <input name="proposalMinSeverity" type="number" min={1} max={3} required defaultValue={settings?.proposalMinSeverity ?? 3} />
        </label>
        <button type="submit">Guardar ajustes</button>
      </form>

      <h2>Requisitos</h2>
      <ul>
        {requirements.map((r) => (
          <li key={r.id}>
            {r.title} · {r.points} puntos · {SOURCE_LABEL[r.source]} · {r.active ? "Activo" : "Inactivo"}
            <form action={activar} style={{ display: "inline-flex" }}>
              <input type="hidden" name="requirementId" value={r.id} />
              <input type="hidden" name="active" value={String(!r.active)} />
              <button type="submit">{r.active ? "Desactivar" : "Activar"}</button>
            </form>
          </li>
        ))}
        {requirements.length === 0 && <li>Sin requisitos: el puntaje de todos es 0.</li>}
      </ul>
      <form action={nuevoRequisito}>
        <label>Código <input name="code" required pattern="[a-z0-9-]{2,40}" /></label>
        <label>Título <input name="title" required minLength={3} maxLength={160} /></label>
        <label>Descripción <input name="description" maxLength={2000} /></label>
        <label>Puntos <input name="points" type="number" min={1} max={100} required /></label>
        <label>
          Fuente
          <select name="source" defaultValue="manual">
            <option value="manual">Manual</option>
            <option value="kpi">Indicador</option>
          </select>
        </label>
        <label>Indicador (si es por indicador) <input name="kpiSource" placeholder="proyectos" /></label>
        <label>
          Comparación
          <select name="op" defaultValue="gte">
            <option value="gte">Al menos</option>
            <option value="lte">A lo más</option>
          </select>
        </label>
        <label>Umbral <input name="threshold" type="number" step="any" /></label>
        <button type="submit">Agregar requisito</button>
      </form>

      <h2>Marcas manuales</h2>
      {manual.length === 0 ? (
        <p>Sin requisitos manuales activos.</p>
      ) : (
        <form action={marcar}>
          <label>
            Requisito
            <select name="requirementId" required>
              {manual.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sujeto
            <select name="subject" required>
              {barcos.map((b) => (
                <option key={b.id} value={`barco:${b.id}`}>
                  Barco · {b.name}
                </option>
              ))}
              {affiliates.map((a) => (
                <option key={a.id} value={`afiliada:${a.id}`}>
                  Afiliada · {a.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" name="met" /> Cumple
          </label>
          <label>Evidencia <input name="evidenceNote" maxLength={2000} /></label>
          <button type="submit">Guardar marca</button>
        </form>
      )}

      <h2>Evaluaciones por firmar</h2>
      <ul>
        {pending.map((e) => (
          <li key={e.id}>
            {e.subjectName} · {e.score} puntos
            {e.firstApproverId === userId ? (
              <em> — ya firmaste, falta la firma del otro dueño</em>
            ) : (
              <>
                {e.firstApproverId && <em> — ya firmó un socio</em>}
                <form action={decidir} style={{ display: "inline-flex" }}>
                  <input type="hidden" name="evaluationId" value={e.id} />
                  <button name="decision" value="aprobar">Aprobar</button>
                  <button name="decision" value="rechazar">Rechazar</button>
                </form>
              </>
            )}
          </li>
        ))}
        {pending.length === 0 && <li>Nada por firmar.</li>}
      </ul>

      <h2>Certificados</h2>
      <ul>
        {approved.map((e) => (
          <li key={e.id}>
            {e.subjectName} · {e.score} puntos · {VIGENCIA_LABEL[e.vigencia ?? ""] ?? "Sin vigencia"}
          </li>
        ))}
        {approved.length === 0 && <li>Nadie certificado todavía.</li>}
      </ul>
    </main>
  );
}
