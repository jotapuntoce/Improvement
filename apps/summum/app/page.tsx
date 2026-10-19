// Entrada: dueño de un muelle -> su panel; dueño de un barco ya colgado de un muelle -> su barco;
// sin sesión -> login. Con sesión pero sin nada propio se dice aquí mismo: redirigir a /login haría un ciclo.
import { redirect } from "next/navigation";
import { getSessionUserId, listMyBarcos, listMyDocks } from "@/server/auth/guard.ts";
import s from "./login/login.module.css";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const [dock] = await listMyDocks(userId);
  if (dock) redirect(`/muelle/${dock.id}/barcos`);
  const [barco] = await listMyBarcos(userId);
  if (barco) redirect(`/barco/${barco.id}`);
  return (
    <main className={s.login}>
      <div className={s.marca}>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG del kit de marca, sin optimizar */}
        <img src="/brand/logo-completo-hueso.svg" alt="Summum System" />
      </div>
      <div className={s.lado}>
        <div className={s.form}>
          <span className={s.etiqueta}>Aún no hay muelle</span>
          <h1 className={s.titulo}>Tu empresa todavía no está en Summum</h1>
          <p className={s.nota}>
            Entraste bien, pero tu cuenta no es dueña de un muelle ni de un barco que ya esté en uno. Cuando Summum
            agregue tu empresa a su muelle, aquí vas a ver tus cobros.
          </p>
        </div>
      </div>
    </main>
  );
}
