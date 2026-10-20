"use client";

// Formulario email/contraseña contra Supabase Auth — hoja "use client" de /login (movido a un
// archivo propio para que page.tsx pueda envolverlo en <Suspense>: useSearchParams() exige un
// boundary de Suspense para poder prerenderizarse, error real encontrado en `next build` al
// verificar E1-T6, la primera vez que esta app corrió un build de producción completo).
//
// Nota honesta sobre el manejo de sesión en v1: @supabase/supabase-js guarda la sesión en
// localStorage por default (client-only). Para que server/auth/guard.ts (Server Components) pueda
// leerla, este formulario copia el access token a una cookie propia (`sum-access-token`) al iniciar
// sesión. El manejo "oficial" de sesión SSR de Supabase usa el paquete @supabase/ssr, que no está en
// las dependencias fijadas del proyecto — este es un atajo documentado, no un descuido:
// sin refresh automático de token todavía, aceptable para el piloto de un solo cliente. Si el
// refresco automático se vuelve necesario, ese es el momento de agregar @supabase/ssr (con su propio
// pin verificado vía stack-researcher), no de inventar más cookies a mano.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import s from "./login.module.css";
import Link from "next/link";

// Next.js solo inlinea NEXT_PUBLIC_* en el bundle del navegador cuando detecta un acceso literal
// `process.env.NEXT_PUBLIC_X` en el código fuente — lib/env.ts hace `schema.parse(process.env)`
// (acceso dinámico), así que ese objeto queda vacío del lado del cliente. Bug real encontrado en
// producción: el login nunca funcionó porque siempre entraba a la rama "Supabase no está
// configurado". Server-only (guard.ts, gateway.ts, etc.) no tiene este problema — ahí process.env
// es el proceso Node real, sin inlining de por medio.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function LoginForm({ enModal = false }: { enModal?: boolean }) {
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
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    // Cookie que server/auth/guard.ts lee del lado del servidor — ver nota arriba. El nombre lleva
    // prefijo propio a propósito: apps/admin escribe `sb-access-token` httpOnly desde el servidor, y
    // las cookies ignoran el puerto, así que en localhost (admin :3100, summum :3300 — mismo
    // host) ambas apps se pisaban bajo un solo nombre. Peor: document.cookie no puede sobrescribir
    // ni borrar una httpOnly, así que la sesión de admin ganaba siempre y el cliente terminaba
    // viendo el panel de Jose Carlos. Bug real encontrado probando el flujo de cliente end-to-end.
    document.cookie = `sum-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;

    const requested = searchParams.get("returnTo");
    const returnTo = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
    router.push(returnTo);
    router.refresh();
  }

  const tarjeta = (
    <form onSubmit={handleSubmit} className={s.tarjeta}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG del kit de marca, sin optimizar */}
      <img src="/brand/isotipo-navy.svg" alt="" className={s.isotipo} />
      <h1 className={s.titulo}>Entra a Summum</h1>
      <label className={s.campo}>
        Correo
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className={s.campo}>
        Contraseña
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className={s.error}>{error}</p>}
      <button type="submit" disabled={loading} className={s.entrar}>
        {loading ? "Entrando..." : "Entrar"}
      </button>
      <p className={s.nota}>¿Aún no eres miembro? Al equipo se entra con el diagnóstico, no con la tarjeta.</p>
    </form>
  );
  if (enModal) return tarjeta;

  return (
    <main className={s.login}>
      <Link href="/" className={s.inicio} aria-label="Inicio de Summum System">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG del kit de marca, sin optimizar */}
        <img src="/brand/wordmark-navy.svg" alt="Summum System" />
      </Link>
      <a href="/diagnostico" className={s.diagnostico}>
        Diagnóstico 360 <span aria-hidden="true">→</span>
      </a>
      {tarjeta}
    </main>
  );
}
