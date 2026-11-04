"use client";

// Formulario email/contraseña contra Supabase Auth — hoja "use client" de /login (movido a un
// archivo propio para que page.tsx pueda envolverlo en <Suspense>: useSearchParams() exige un
// boundary de Suspense para poder prerenderizarse, error real encontrado en `next build` al
// verificar E1-T6, la primera vez que esta app corrió un build de producción completo).
//
// Nota honesta sobre el manejo de sesión en v1: @supabase/supabase-js guarda la sesión en
// localStorage por default (client-only). Para que server/auth/guard.ts (Server Components) pueda
// leerla, este formulario copia el access token a una cookie propia (`imp-access-token`) al iniciar
// sesión. El manejo "oficial" de sesión SSR de Supabase usa el paquete @supabase/ssr, que no está en
// las dependencias fijadas de este blueprint (§11) — este es un atajo documentado, no un descuido:
// sin refresh automático de token todavía, aceptable para el piloto de un solo cliente. Si el
// refresco automático se vuelve necesario, ese es el momento de agregar @supabase/ssr (con su propio
// pin verificado vía stack-researcher), no de inventar más cookies a mano.
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Isotipo } from "@/components/brand/Isotipo.tsx";
import { Constelacion } from "@/components/auth/Constelacion.tsx";

// Next.js solo inlinea NEXT_PUBLIC_* en el bundle del navegador cuando detecta un acceso literal
// `process.env.NEXT_PUBLIC_X` en el código fuente — lib/env.ts hace `schema.parse(process.env)`
// (acceso dinámico), así que ese objeto queda vacío del lado del cliente. Bug real encontrado en
// producción: el login nunca funcionó porque siempre entraba a la rama "Supabase no está
// configurado". Server-only (guard.ts, gateway.ts, etc.) no tiene este problema — ahí process.env
// es el proceso Node real, sin inlining de por medio.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Supabase no está configurado en este entorno.");
      setLoading(false);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.session) {
      setError(
        signInError?.code === "email_not_confirmed"
          ? "Aún no confirmas tu correo. Abre el enlace que te mandamos y vuelve a entrar."
          : "Email o contraseña incorrectos.",
      );
      setLoading(false);
      return;
    }

    // Cookie que server/auth/guard.ts lee del lado del servidor — ver nota arriba. El nombre lleva
    // prefijo propio a propósito: apps/admin escribe `sb-access-token` httpOnly desde el servidor, y
    // las cookies ignoran el puerto, así que en localhost (admin :3100, improvement :3200 — mismo
    // host) ambas apps se pisaban bajo un solo nombre. Peor: document.cookie no puede sobrescribir
    // ni borrar una httpOnly, así que la sesión de admin ganaba siempre y el cliente terminaba
    // viendo el panel de Jose Carlos. Bug real encontrado probando el flujo de cliente end-to-end.
    document.cookie = `imp-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax`;

    const returnTo = searchParams.get("returnTo") ?? "/";
    router.push(returnTo);
    router.refresh();
  }

  return (
    <main className="auth-shell auth-split">
      <Constelacion />
      <section className="auth-story" aria-label="Qué es Improvement">
        <p className="auth-brand">Improvement</p>
        <h2 className="auth-headline">Tu negocio, <em>dirigido y controlado</em> todos los días.</h2>
        <ul className="auth-points">
          <li>Diagnostica tu negocio y te dice por dónde empezar.</li>
          <li>Convierte lo que falta en un plan y lo ejecuta contigo.</li>
          <li>Tu negocio evoluciona y Improvement crece con él.</li>
        </ul>
        <p className="auth-quote">“Mi equipo sabe qué hacer sin que yo lo persiga.”</p>
      </section>
      <div className="auth-side">
      <form onSubmit={handleSubmit} className="auth-card auth-card-center" aria-label="Entrar">
        <Isotipo variante="red" className="auth-logo" />
        <h1 className="auth-title">Entra a tu Improvement</h1>
        <p className="auth-sub">Entra para ver lo que toca hoy en tu negocio.</p>
        <label className="auth-field">
          Correo
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" />
        </label>
        <label className="auth-field">
          Contraseña
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={loading} className="auth-primary">
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <div className="auth-switch">
          <p>¿Nuevo en Improvement?</p>
          <Link href="/registro" className="auth-secondary">Crea tu cuenta</Link>
        </div>
      </form>
      </div>
    </main>
  );
}
