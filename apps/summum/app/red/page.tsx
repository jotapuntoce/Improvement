// Mis redes: los muelles de la persona (los suyos, donde es afiliada activa o donde trabaja en un barco),
// con la entrada a su Pacto y, si es afiliada, a su perfil.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { listMyNetworks } from "@/server/pacto/pacto.ts";

export const metadata = { title: "Mis redes · Summum System" };

export default async function MisRedesPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent("/red")}`);
  const networks = await listMyNetworks(userId);
  return (
    <main style={{ padding: "24px" }}>
      <h1>Mis redes</h1>
      <ul>
        {networks.map((n) => (
          <li key={n.id}>
            {n.name} · <Link href={`/red/${n.id}/mi-transformacion`}>Mi transformación</Link>
            {n.isAffiliate && (
              <>
                {" "}
                · <Link href={`/red/${n.id}/afiliada`}>Mi perfil de afiliada</Link>
              </>
            )}
          </li>
        ))}
        {networks.length === 0 && <li>Todavía no perteneces a ninguna red.</li>}
      </ul>
    </main>
  );
}
