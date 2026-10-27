// Ranking de afiliadas del muelle: posición, nombre, nivel y puntos de la comunidad.
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { leaderboard } from "@/server/community/leaderboard.ts";

export default async function RankingPage({ params }: { params: Promise<{ muelleId: string }> }) {
  const { muelleId } = await params;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(`/red/${muelleId}/ranking`)}`);
  const rows = await leaderboard(userId, muelleId);
  return (
    <main style={{ padding: "24px" }}>
      <h1>Ranking de afiliadas</h1>
      <ol>
        {rows.map((r) => (
          <li key={r.profileId}>
            {r.displayName} · Nivel {r.level} · {r.points} puntos
          </li>
        ))}
      </ol>
      {rows.length === 0 && <p>Todavía no hay afiliadas activas.</p>}
    </main>
  );
}
