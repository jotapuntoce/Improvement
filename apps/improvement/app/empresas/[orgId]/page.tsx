// La ruta vieja del edificio: el negocio ahora vive en /[org] (barra de apps + inicio). Se conserva
// para enlaces guardados; el guard va primero para no confirmar que un org existe a un ajeno.
import { redirect } from "next/navigation";
import { requireOrgMembership } from "@/server/auth/guard.ts";

export default async function EmpresaPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await requireOrgMembership(orgId);
  redirect(`/${orgId}`);
}
