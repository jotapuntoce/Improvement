// Lista + detalle de objetivos (§9.6 del blueprint). Server Component: resuelve tenencia con
// requireOrgMembership antes de tocar cualquier dato (regla de apps/improvement/server/auth/guard.ts
// — un 404, nunca un 403, para un org al que el usuario no pertenece). La paginación vive en la URL
// (`?cursor=`), sin estado de cliente para la lista.
import { revalidatePath } from "next/cache";
import { requireOrgMembership } from "@/server/auth/guard";
import { completeObjective, listObjectives } from "@/server/objectives/mutations";
import { pointsForObjective } from "@/server/objectives/points";
import { CompleteObjectiveButton } from "./CompleteObjectiveButton.tsx";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completado",
};

export default async function ObjetivosPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { org: orgId } = await params;
  const { cursor } = await searchParams;

  const membership = await requireOrgMembership(orgId);
  const { data } = await listObjectives(membership.userId, orgId, { cursor: cursor ?? null });

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Objetivos</h1>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        {data.objectives.map((objective) => {
          const isCompleted = objective.status === "completed";

          async function complete() {
            "use server";
            const row = await requireOrgMembership(orgId);
            await completeObjective(row.userId, orgId, objective.id);
            revalidatePath(`/${orgId}/objetivos`);
          }

          return (
            <li
              key={objective.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "16px",
                borderRadius: "var(--radius-md, 16px)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
              }}
            >
              <div>
                <p style={{ fontWeight: 600, margin: 0 }}>{objective.title}</p>
                {objective.description && (
                  <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "4px 0 0" }}>
                    {objective.description}
                  </p>
                )}
                <p style={{ color: "var(--text-secondary)", fontSize: "12px", margin: "6px 0 0" }}>
                  Peso {objective.impactWeight} · {pointsForObjective(objective.impactWeight)} pts ·{" "}
                  {STATUS_LABEL[objective.status] ?? objective.status}
                </p>
              </div>
              <CompleteObjectiveButton action={complete} disabled={isCompleted} />
            </li>
          );
        })}
        {data.objectives.length === 0 && (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Sin objetivos todavía.</p>
        )}
      </ul>

      {data.nextCursor && (
        <a
          href={`?cursor=${encodeURIComponent(data.nextCursor)}`}
          style={{ color: "var(--accent-2)", fontSize: "13px", textDecoration: "none" }}
        >
          Siguiente página →
        </a>
      )}
    </main>
  );
}
