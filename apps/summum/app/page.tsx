// Entrada: dueño de un muelle -> su panel; dueño de un barco ya colgado de un muelle -> su barco;
// sin sesión -> el inicio público (landing). Con sesión pero sin nada propio se dice aquí mismo: redirigir a /login haría un ciclo.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { getSessionUserId, listMyBarcos, listMyDocks } from "@/server/auth/guard.ts";
import { Landing } from "@/components/Landing.tsx";
import s from "@/components/login.module.css";
import Link from "next/link";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) return <Landing video={existsSync(join(process.cwd(), "public/brand/hero.mp4"))} />;
  const [dock] = await listMyDocks(userId);
  if (dock) redirect(`/muelle/${dock.id}/barcos`);
  const [barco] = await listMyBarcos(userId);
  if (barco) redirect(`/barco/${barco.id}`);
  return (
    <main className={s.login}>
      <Link href="/" className={s.inicio} aria-label="Inicio de Summum System">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG del kit de marca, sin optimizar */}
        <img src="/brand/wordmark-navy.svg" alt="Summum System" />
      </Link>
      <div className={s.tarjeta}>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG del kit de marca, sin optimizar */}
        <img src="/brand/isotipo-navy.svg" alt="" className={s.isotipo} />
        <span className={s.etiqueta}>Aún no hay muelle</span>
        <h1 className={s.titulo}>Tu empresa todavía no está en Summum</h1>
        <p className={s.nota}>
          Entraste bien, pero tu cuenta no es dueña de un muelle ni de un barco que ya esté en uno. Cuando Summum
          agregue tu empresa a su muelle, aquí vas a ver tus cobros.
        </p>
      </div>
    </main>
  );
}
