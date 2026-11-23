"use client";
// Regreso de Google y de los enlaces de los correos (confirmar registro, recuperar contraseña).
// Los correos traen ?token_hash=…&type=… para que el enlace sea de jotapuntoce.com y no de supabase.co
// (un enlace a otro dominio que el remitente es señal de spam); aquí se canjea con verifyOtp. Google
// trae la sesión en el fragmento y supabase-js la lee sola. Luego se copia el token a la cookie que
// lee guard.ts y se manda a "/" (o a /auth/nueva-contrasena si es recuperación).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type EmailOtpType } from "@supabase/supabase-js";
import { guardarCookie } from "@/components/auth/SesionViva.tsx";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TIPOS: EmailOtpType[] = ["email", "signup", "recovery", "invite", "magiclink", "email_change"];

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState(!supabaseUrl || !supabaseAnonKey);
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = TIPOS.find((t) => t === params.get("type"));
    (async () => {
      if (tokenHash && type) {
        const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (otpError) return setError(true);
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) return setError(true);
      guardarCookie(data.session);
      router.replace(type === "recovery" ? "/auth/nueva-contrasena" : "/");
      router.refresh();
    })();
  }, [router]);
  return (
    <main className="config-page">
      <p role="status">{error ? "Ese enlace ya no sirve o ya se usó. Entra con tu correo y contraseña." : "Entrando…"}</p>
    </main>
  );
}
