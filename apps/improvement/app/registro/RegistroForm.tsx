"use client";
// Crear cuenta: correo y contraseña (o Google) contra Supabase Auth. Misma cookie `imp-access-token`
// que LoginForm (ver la nota de sesión ahí); con sesión, sigue al arranque guiado.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Isotipo } from "@/components/brand/Isotipo.tsx";
import { RedCreciente } from "@/components/auth/RedCreciente.tsx";
import { BotonGoogle } from "@/components/auth/BotonGoogle.tsx";

// Acceso literal a NEXT_PUBLIC_*: Next solo los inlinea así (ver LoginForm.tsx).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function RegistroForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabaseUrl || !supabaseAnonKey) return setError("Supabase no está configurado en este entorno.");
    setLoading(true);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    // Sin emailRedirectTo el enlace de confirmación caía en la Site URL de Supabase y nunca volvía a
    // la app: /auth/callback lee la sesión del enlace, pone la cookie y manda al arranque vía "/".
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/callback` },
    });
    if (signUpError) {
      setLoading(false);
      return setError(
        signUpError.code === "over_email_send_rate_limit"
          ? "Mandamos demasiados correos en poco tiempo. Espera unos minutos y vuelve a intentar."
          : "No pudimos crear tu cuenta. Revisa el correo y que la contraseña tenga 8 caracteres o más.",
      );
    }
    // Si el correo ya existía o el proyecto no da sesión al registrarse, se intenta entrar con lo mismo.
    let session = data.session;
    if (!session) session = (await supabase.auth.signInWithPassword({ email, password })).data.session;
    if (!session) {
      setLoading(false);
      return setSent(true);
    }
    document.cookie = `imp-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
    router.push("/arranque");
    router.refresh();
  }

  return (
    <main className="auth-shell auth-split auth-reg">
      <RedCreciente />
      <section className="auth-story auth-pain" aria-label="Lo que resuelve Improvement">
        <p className="auth-brand">Improvement</p>
        <h2 className="auth-headline">Si tú no estás, ¿tu negocio sigue caminando?</h2>
        <ul className="auth-hurts">
          <li>Los pendientes viven en tu cabeza y en WhatsApp.</li>
          <li>Sabes cuánto vendiste hasta que cierras el mes.</li>
          <li>Tu equipo te pregunta todo antes de moverse.</li>
        </ul>
        <p className="auth-relief">
          Improvement lo ve contigo, te dice qué falta y lo resuelve paso a paso, para que tu negocio camine
          aunque no estés en todo.
        </p>
      </section>
      <div className="auth-side">
      <form onSubmit={handleSubmit} className="auth-open" aria-label="Crear cuenta">
        <Isotipo variante="solido" className="auth-logo auth-logo-lg" />
        <h1 className="auth-title auth-title-lg">Crea tu Improvement</h1>
        <p className="auth-sub">En unos minutos tienes tu negocio digital armado.</p>
        {sent ? (
          <p className="auth-notice" role="status">
            Te mandamos un correo a <strong>{email}</strong>. Abre el enlace para confirmar tu cuenta y te
            traemos de vuelta para armar tu negocio.
          </p>
        ) : (
          <>
            <BotonGoogle onError={setError} />
            <p className="auth-divider">o con tu correo</p>
            <input type="email" required autoComplete="email" aria-label="Correo" placeholder="tu@negocio.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" />
            <input type="password" required minLength={8} autoComplete="new-password" aria-label="Contraseña" placeholder="Contraseña (mín. 8)" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" />
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" disabled={loading} className="auth-primary">{loading ? "Creando…" : "Crear cuenta"}</button>
          </>
        )}
        <p className="auth-back">¿Ya tienes cuenta? <Link href="/login">Entra →</Link></p>
      </form>
      </div>
    </main>
  );
}
