"use client";

// Único punto no autenticado de apps/improvement. Formulario email/contraseña contra Supabase Auth.
//
// Nota honesta sobre el manejo de sesión en v1: @supabase/supabase-js guarda la sesión en
// localStorage por default (client-only). Para que server/auth/guard.ts (Server Components) pueda
// leerla, este formulario copia el access token a una cookie propia (`sb-access-token`) al iniciar
// sesión. El manejo "oficial" de sesión SSR de Supabase usa el paquete @supabase/ssr, que no está en
// las dependencias fijadas de este blueprint (§11) — este es un atajo documentado, no un descuido:
// sin refresh automático de token todavía, aceptable para el piloto de un solo cliente. Si el
// refresco automático se vuelve necesario, ese es el momento de agregar @supabase/ssr (con su propio
// pin verificado vía stack-researcher), no de inventar más cookies a mano.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export default function LoginPage() {
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

    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setError("Supabase no está configurado en este entorno.");
      setLoading(false);
      return;
    }

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.session) {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    // Cookie que server/auth/guard.ts lee del lado del servidor — ver nota arriba.
    document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax`;

    const returnTo = searchParams.get("returnTo") ?? "/";
    router.push(returnTo);
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: "360px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "24px",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "8px",
            background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Improvement
        </h1>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
            }}
          />
        </label>
        {error && <p style={{ color: "var(--danger)", fontSize: "13px" }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "none",
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
            color: "#05060b",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
