// El panel de una empresa: abre en su edificio, en la escena de la etapa en la que va — de ahí
// se entra a la recepción, que es la oficina con sus muebles (ver BuildingExperience.tsx).
//
// Los dos grafos se cargan aquí, juntos y en paralelo: el edificio no se puede dibujar sin el
// primero, y la recepción se abre de un clic, sin pasar por el servidor otra vez. Cada loader
// resuelve su propia tenencia adentro (convención de la casa), así que esta ruta no filtra nada.
//
// Sin BackLink propio: la recepción ya tiene su "Salir a la calle" y el edificio su "Volver a mis
// empresas", y dos formas de volver en la misma pantalla es una de más.
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { loadBuilding } from "@/server/building/loadBuilding.ts";
import { loadLobby } from "@/server/lobby/loadLobby.ts";
import { DirectorBubble } from "@/components/DirectorBubble.tsx";
import { BuildingExperience } from "./BuildingExperience.tsx";

export default async function EmpresaBuildingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);
  const [graph, lobby] = await Promise.all([
    loadBuilding(memberRow.userId, orgId),
    loadLobby(memberRow.userId, orgId),
  ]);

  // El diagnóstico y el chat con Improvement son solo del dueño (404 para todos los demás, ver
  // /[org]/necesidades). La puerta se decide aquí, en el servidor, y no dentro del componente: que
  // una pantalla ofrezca una puerta que devuelve 404 al tocarla es peor que no ofrecerla.
  return (
    <>
      <BuildingExperience
        orgId={orgId}
        graph={graph}
        lobby={lobby}
        esDueno={memberRow.role === "owner"}
      />
      {/* La recepción no cuelga del layout de [org], así que aquí se monta aparte. Es la pantalla
          donde más falta hace: es por donde se entra, y donde el dueño llega sin saber qué mirar. */}
      <DirectorBubble orgId={orgId} />
    </>
  );
}
