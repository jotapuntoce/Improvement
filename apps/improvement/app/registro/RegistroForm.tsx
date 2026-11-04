"use client";
// Crear cuenta: correo y contraseña (o Google) contra Supabase Auth. Misma cookie `imp-access-token`
// que LoginForm (ver la nota de sesión ahí); con sesión, sigue al arranque guiado.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Isotipo } from "@/components/brand/Isotipo.tsx";
import { RedCreciente } from "@/components/auth/RedCreciente.tsx";

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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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

  async function google() {
    if (!supabaseUrl || !supabaseAnonKey) return setError("Supabase no está configurado en este entorno.");
    const { error: oauthError } = await createClient(supabaseUrl, supabaseAnonKey).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) setError("Google no está disponible todavía. Usa tu correo.");
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
            <button type="button" onClick={google} className="auth-google">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" /><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" /></svg>
              Continuar con Google
            </button>
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
