// Entrada: dueño de un muelle -> su panel; dueño de un barco -> su barco; sin sesión -> login.
// Con sesión pero sin nada propio se dice aquí mismo: redirigir a /login haría un ciclo.
import { redirect } from "next/navigation";
import { getSessionUserId, listMyBarcos, listMyDocks } from "@/server/auth/guard.ts";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const [dock] = await listMyDocks(userId);
  if (dock) redirect(`/muelle/${dock.id}/barcos`);
  const [barco] = await listMyBarcos(userId);
  if (barco) redirect(`/barco/${barco.id}`);
  return <p>Tu cuenta no es dueña de ningún muelle ni barco.</p>;
}
