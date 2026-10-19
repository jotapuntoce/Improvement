// Entrada: si es dueño de un muelle, a su panel; si no, al login. Nada que mostrar aquí.
import { redirect } from "next/navigation";
import { getSessionUserId, listMyDocks } from "@/server/auth/guard.ts";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const [dock] = await listMyDocks(userId);
  redirect(dock ? `/muelle/${dock.id}/barcos` : "/login");
}
