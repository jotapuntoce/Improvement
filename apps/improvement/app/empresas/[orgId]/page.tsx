// El panel de una empresa: abre en su recepción (ver BuildingExperience.tsx).
//
// Sin BackLink propio: la recepción ya tiene su "Volver a mis empresas" abajo, y dos formas de
// volver en la misma pantalla es una de más.
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { loadBuilding } from "@/server/building/loadBuilding.ts";
import { BuildingExperience } from "./BuildingExperience.tsx";

export default async function EmpresaBuildingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);
  const graph = await loadBuilding(memberRow.userId, orgId);

  // El diagnóstico es solo del dueño (404 para todos los demás, ver /[org]/necesidades). La puerta
  // se decide aquí, en el servidor, y no dentro del componente: que una pantalla ofrezca una puerta
  // que devuelve 404 al tocarla es peor que no ofrecerla.
  return (
    <BuildingExperience orgId={orgId} graph={graph} esDueno={memberRow.role === "owner"} />
  );
}
