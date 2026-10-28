"use client";
// Crear cuenta: correo y contraseña (o Google) contra Supabase Auth. Misma cookie `imp-access-token`
// que LoginForm (ver la nota de sesión ahí); con sesión, sigue al arranque guiado.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// Acceso literal a NEXT_PUBLIC_*: Next solo los inlinea así (ver LoginForm.tsx).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function RegistroForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabaseUrl || !supabaseAnonKey) return setError("Supabase no está configurado en este entorno.");
    setLoading(true);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabase.auth.signUp({ email, password });
    // Si el correo ya existía o el proyecto no da sesión al registrarse, se intenta entrar con lo mismo.
    let session = data.session;
    if (!session) session = (await supabase.auth.signInWithPassword({ email, password })).data.session;
    if (!session) {
      setLoading(false);
      return setError("Revisa tu correo para confirmar tu cuenta y luego entra.");
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
    <main className="config-page auth-page">
      <h1 className="config-title">Crea tu Improvement</h1>
      <p className="config-hint">Gratis. En unos minutos tienes tu negocio armado.</p>
      <form onSubmit={handleSubmit} className="config-form config-form-stack config-card" aria-label="Crear cuenta">
        <label className="permiso-field">
          <span>Correo</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Contraseña</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="config-input" />
        </label>
        {error && <p className="invite-error" role="alert">{error}</p>}
        <button type="submit" disabled={loading} className="panel-cta">{loading ? "Creando…" : "Crear cuenta"}</button>
        <button type="button" onClick={google} className="panel-btn-ghost">Continuar con Google</button>
      </form>
      <p className="config-hint">¿Ya tienes cuenta? <Link href="/login">Entra</Link></p>
    </main>
  );
}
