// Inicio del negocio: portada y logo de su marca, las tarjetas fijas (junta, siguiente movimiento) y
// debajo el tablero de cada persona: sus tarjetas, que agrega, acomoda y quita.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { getBrand } from "@/server/brand/brand.ts";
import { cardData, moveCard, removeCard, seedDefaultCards } from "@/server/dashboard/cards.ts";
import { CardBody, type CardBodyData } from "@/components/dashboard/CardBody.tsx";
import { revalidatePath } from "next/cache";
import { isMeetingPending } from "@/server/direccion/meetings/meetings.ts";
import { refreshNextMove } from "@/server/ai/nextMove.ts";
import { needsOnboarding } from "@/server/registro/onboarding.ts";

const NEXT_MOVE_ERROR = "Improvement no pudo pensar la jugada ahora; ves la más urgente.";

// Fuera del componente: una Server Action solo puede cerrar sobre valores serializables.
async function acomodar(formData: FormData) {
  "use server";
  const actor = await getSessionUserId();
  if (!actor) notFound();
  const orgId = formData.get("org")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const op = formData.get("op")?.toString();
  if (op === "quitar") await removeCard(actor, orgId, id);
  else if (op === "arriba" || op === "abajo") await moveCard(actor, orgId, id, op);
  revalidatePath(`/${orgId}`);
}

export default async function OrgHome({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const memberRow = await requireOrgMembership(orgId);
  const isOwner = memberRow.role === "owner";
  // El dueño que se registró y no cerró su arranque lo retoma donde lo dejó.
  if (isOwner && (await needsOnboarding(memberRow.userId, orgId))) redirect(`/arranque/${orgId}/marca`);
  const [brand, cards, juntaPendiente] = await Promise.all([
    getBrand(memberRow.userId, orgId),
    seedDefaultCards(memberRow.userId, orgId),
    isMeetingPending(memberRow.userId, orgId),
  ]);
  const board = cards.ok ? cards.data : [];
  const datos = await Promise.all(board.map((c) => cardData(memberRow.userId, orgId, c)));

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
      <div className="dash-grid">
        {board.map((c, i) => {
          const d = datos[i]!;
          return (
            <section key={c.id} className="config-card dash-card" aria-labelledby={`card-${c.id}`}>
              <h2 id={`card-${c.id}`} className="config-card-title">{c.title}</h2>
              <CardBody data={d.ok ? (d.data as CardBodyData) : null} error={d.ok ? null : d.error.message} orgId={orgId} />
              <form action={acomodar} className="task-inline dash-tools" aria-label={`Acomodar ${c.title}`}>
                <input type="hidden" name="org" value={orgId} />
                <input type="hidden" name="id" value={c.id} />
                {i > 0 && <button type="submit" name="op" value="arriba" className="panel-btn-ghost" aria-label={`Subir ${c.title}`}>Subir</button>}
                {i < board.length - 1 && <button type="submit" name="op" value="abajo" className="panel-btn-ghost" aria-label={`Bajar ${c.title}`}>Bajar</button>}
                <button type="submit" name="op" value="quitar" className="panel-btn-ghost" aria-label={`Quitar ${c.title}`}>Quitar</button>
              </form>
            </section>
          );
        })}
      </div>
      <p><Link href={`/${orgId}/tablero/agregar`} className="panel-cta">Agregar tarjeta</Link></p>
    </main>
  );
}
