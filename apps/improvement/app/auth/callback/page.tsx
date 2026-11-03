"use client";
// Regreso de Google: supabase-js lee la sesión del fragmento de la URL; aquí solo se copia el token
// a la cookie que lee guard.ts (mismo atajo documentado en LoginForm) y se manda a "/".
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState(!supabaseUrl || !supabaseAnonKey);
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return;
    createClient(supabaseUrl, supabaseAnonKey)
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) return setError(true);
        document.cookie = `imp-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax`;
        router.replace("/");
        router.refresh();
      });
  }, [router]);
  return (
    <main className="config-page">
      <p role="status">{error ? "No pudimos entrar con Google. Intenta con tu correo." : "Entrando…"}</p>
    </main>
  );
}
