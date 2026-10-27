// El panel de una empresa: abre en su edificio, en la escena de la etapa en la que va — de ahí
// se entra a la recepción, que es la oficina con sus muebles (ver BuildingExperience.tsx).
//
// Los dos grafos se cargan aquí, juntos y en paralelo: el edificio no se puede dibujar sin el
// primero, y la recepción se abre de un clic, sin pasar por el servidor otra vez. Cada loader
// resuelve su propia tenencia adentro (convención de la casa), así que esta ruta no filtra nada.
//
// Sin BackLink propio: la recepción ya tiene su "Salir a la calle" y el edificio su "Volver a mis
// empresas", y dos formas de volver en la misma pantalla es una de más.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { refreshNextMove } from "@/server/ai/nextMove.ts";
import { loadBuilding } from "@/server/building/loadBuilding.ts";
import { isMeetingPending } from "@/server/direccion/meetings/meetings.ts";
import { loadLobby } from "@/server/lobby/loadLobby.ts";
import { BuildingExperience } from "./BuildingExperience.tsx";

const NEXT_MOVE_ERROR = "Improvement no pudo pensar la jugada ahora; ves la más urgente.";

export default async function EmpresaBuildingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);
  const [graph, lobby, juntaPendiente] = await Promise.all([
    loadBuilding(memberRow.userId, orgId),
    loadLobby(memberRow.userId, orgId),
    isMeetingPending(memberRow.userId, orgId),
  ]);

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
    redirect(ok ? "/empresas" : `/empresas?error=${encodeURIComponent(NEXT_MOVE_ERROR)}`);
  }

  // El diagnóstico y el chat con Improvement son solo del dueño (404 para todos los demás, ver
  // /[org]/necesidades). La puerta se decide aquí, en el servidor, y no dentro del componente: que
  // una pantalla ofrezca una puerta que devuelve 404 al tocarla es peor que no ofrecerla.
  return (
    <>
      {juntaPendiente && (
        <aside className="config-card" aria-label="Junta pendiente">
          <p>Junta pendiente</p>
          <Link href={`/${orgId}/direccion/junta`}>Ir a la junta semanal</Link>
        </aside>
      )}
      {memberRow.role === "owner" && (
        <form action={pedirMovimiento} className="config-card" aria-label="Siguiente movimiento">
          <button type="submit" className="panel-cta">
            Pedir siguiente movimiento
          </button>
        </form>
      )}
      <BuildingExperience
        orgId={orgId}
        graph={graph}
        lobby={lobby}
        esDueno={memberRow.role === "owner"}
      />
    </>
  );
}
