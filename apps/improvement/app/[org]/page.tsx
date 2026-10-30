// Inicio del negocio: portada y logo de su marca, y lo que le importa hoy. El tablero que elige el
// dueño llega en la fase 5; aquí van las tarjetas fijas (junta, siguiente movimiento, su bandeja).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { getBrand } from "@/server/brand/brand.ts";
import { listInbox } from "@/server/tasks/inbox.ts";
import { isMeetingPending } from "@/server/direccion/meetings/meetings.ts";
import { refreshNextMove } from "@/server/ai/nextMove.ts";
import { needsOnboarding } from "@/server/registro/onboarding.ts";

const NEXT_MOVE_ERROR = "Improvement no pudo pensar la jugada ahora; ves la más urgente.";

export default async function OrgHome({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const memberRow = await requireOrgMembership(orgId);
  const isOwner = memberRow.role === "owner";
  // El dueño que se registró y no cerró su arranque lo retoma donde lo dejó.
  if (isOwner && (await needsOnboarding(memberRow.userId, orgId))) redirect(`/arranque/${orgId}/marca`);
  const [brand, inbox, juntaPendiente] = await Promise.all([
    getBrand(memberRow.userId, orgId),
    listInbox(memberRow.userId, orgId),
    isMeetingPending(memberRow.userId, orgId),
  ]);
  const mine = inbox.ok ? inbox.data.slice(0, 8) : [];

  async function pedirMovimiento() {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    // Sin ANTHROPIC_API_KEY, requireEnv lanza: se trata igual que un fallo del proveedor.
    let ok = false;
    try {
      ok = (await refreshNextMove(actor, orgId)).ok;
    } catch {
      ok = false;
    }
    redirect(ok ? `/${orgId}` : `/${orgId}?error=${encodeURIComponent(NEXT_MOVE_ERROR)}`);
  }

  return (
    <main className="config-page">
      <header className="home-cover" style={brand.coverUrl ? { backgroundImage: `url(${JSON.stringify(brand.coverUrl)})` } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL del negocio, dominio desconocido para next/image */}
        {brand.logoUrl && <img src={brand.logoUrl} alt="" className="home-logo" />}
      </header>
      <h1 className="config-title">Lo que toca hoy</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      {juntaPendiente && (
        <aside className="config-card" aria-label="Junta pendiente">
          <p>Junta pendiente</p>
          <Link href={`/${orgId}/direccion/junta`}>Ir a la junta semanal</Link>
        </aside>
      )}
      {isOwner && (
        <form action={pedirMovimiento} className="config-card" aria-label="Siguiente movimiento">
          <button type="submit" className="panel-cta">Pedir siguiente movimiento</button>
        </form>
      )}
      <section className="config-card" aria-labelledby="hoy">
        <h2 id="hoy" className="config-card-title">Pendientes</h2>
        <ul className="equipo-list">
          {mine.map((t) => (
            <li key={`${t.kind}-${t.id}`}><Link href={t.href}>{t.title}</Link>{t.overdue && <span className="task-overdue"> · Vencida</span>}</li>
          ))}
          {mine.length === 0 && <li className="config-hint">Nada pendiente por ahora.</li>}
        </ul>
        <Link href={`/${orgId}/tareas`}>Ver toda mi bandeja</Link>
      </section>
    </main>
  );
}
