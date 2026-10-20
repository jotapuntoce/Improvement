// Entrada: dueño de un muelle -> su panel; dueño de un barco ya colgado de un muelle -> su barco;
// sin sesión -> el inicio público (landing). Con sesión pero sin empresa: aquí mismo se le ofrece
// crearla en Improvement (redirigir a /login haría un ciclo).
import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/lib/env.ts";
import { getSessionUserId, listMyBarcos, listMyDocks } from "@/server/auth/guard.ts";
import { Landing } from "@/components/Landing.tsx";
import s from "@/components/login.module.css";

// Improvement construye la empresa: /empresas abre "Solicitar empresa" con ?solicitar=1, y su login
// regresa ahí con returnTo (la sesión de Improvement es otra cookie).
const crearEmpresaUrl = (base: string) => `${base}/login?returnTo=${encodeURIComponent("/empresas?solicitar=1")}`;

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
        <span className={s.etiqueta}>Bienvenido a Summum</span>
        <h1 className={s.titulo}>Aún no tienes tu empresa</h1>
        <p className={s.nota}>
          Improvement construye la empresa digital de tu negocio contigo: la solicitas, la revisamos y empezamos a
          armarla. Cuando esté lista, aquí vas a ver tus cobros.
        </p>
        {env.NEXT_PUBLIC_IMPROVEMENT_URL ? (
          <a href={crearEmpresaUrl(env.NEXT_PUBLIC_IMPROVEMENT_URL)} className={s.entrar}>
            Crear mi empresa <span aria-hidden="true">→</span>
          </a>
        ) : (
          <p className={s.error}>Falta configurar la dirección de Improvement (NEXT_PUBLIC_IMPROVEMENT_URL).</p>
        )}
        <Link href="/diagnostico" className={s.secundario}>
          Prefiero empezar con el Diagnóstico 360
        </Link>
      </div>
    </main>
  );
}
