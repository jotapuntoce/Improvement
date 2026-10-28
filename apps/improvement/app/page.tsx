import { redirect } from "next/navigation";
import { firstOrgOf, getSessionUserId, isPlatformAdmin } from "@/server/auth/guard.ts";

// `/` nunca es una página en sí — reparte: sin sesión, a /login; el platform admin, a su cartera
// (/empresas); el dueño o el empleado, al inicio de su primera empresa. Quien aún no tiene empresa
// va a /empresas, donde puede solicitarla (hasta que llegue el registro de la fase 2).
export default async function Page() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  if (await isPlatformAdmin(userId)) redirect("/empresas");
  const orgId = await firstOrgOf(userId);
  redirect(orgId ? `/${orgId}` : "/empresas");
}
