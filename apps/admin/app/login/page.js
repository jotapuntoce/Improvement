// Único punto no autenticado de apps/admin (excepción explícita de la regla de route protection —
// ver lib/auth.js). A diferencia de apps/improvement/app/login (que usa un LoginForm "use client" +
// document.cookie porque necesita @supabase/supabase-js en el navegador para múltiples usuarios por
// org), acá basta una Server Action pura: un solo operador (Jose Carlos), sin necesidad de
// NEXT_PUBLIC_SUPABASE_ANON_KEY, y con la cookie puesta httpOnly del lado del servidor — el
// comportamiento que el blueprint describe en su sección "Sessions" (httpOnly, Secure, SameSite=Lax).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "../../lib/db.js";

async function signIn(formData) {
  "use server";
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();
  if (!email || !password) {
    redirect("/login?error=1");
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    redirect("/login?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set("sb-access-token", data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: data.session.expires_in,
  });

  redirect("/");
}

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const hasError = params?.error === "1";

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
        action={signIn}
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
          Panel Administrativo
        </h1>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
          Email
          <input
            type="email"
            name="email"
            required
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
            name="password"
            required
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
            }}
          />
        </label>
        {hasError && (
          <p style={{ color: "var(--danger)", fontSize: "13px" }}>Email o contraseña incorrectos.</p>
        )}
        <button
          type="submit"
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "none",
            fontWeight: 600,
            cursor: "pointer",
            background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
            color: "#05060b",
          }}
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
