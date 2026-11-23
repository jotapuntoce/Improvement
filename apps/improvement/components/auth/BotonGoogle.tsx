"use client";
// "Continuar con Google" de login y registro. Con NEXT_PUBLIC_GOOGLE_CLIENT_ID se usa el botón oficial
// de Google (Google Identity Services): Google le entrega el ID token a esta página y se canjea con
// signInWithIdToken, así la pantalla de Google dice "Ir a jotapuntoce.com" y no "a <ref>.supabase.co"
// (eso pediría el dominio propio de pago de Supabase). Sin la variable (local, E2E) queda el redirect
// de Supabase de siempre. El nonce va en hash a Google y en claro a Supabase, que los compara.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { guardarCookie } from "@/components/auth/SesionViva.tsx";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type Gis = {
  accounts: {
    id: {
      initialize(o: { client_id: string; nonce: string; callback: (r: { credential: string }) => void; use_fedcm_for_button?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, string | number>): void;
    };
  };
};

async function sha256(texto: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function BotonGoogle({ onError }: { onError: (mensaje: string) => void }) {
  const router = useRouter();
  const caja = useRef<HTMLDivElement>(null);
  const [oficial, setOficial] = useState(Boolean(googleClientId));

  useEffect(() => {
    if (!googleClientId || !supabaseUrl || !supabaseAnonKey) return;
    const url = supabaseUrl, key = supabaseAnonKey, clientId = googleClientId;
    let vivo = true;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onerror = () => vivo && setOficial(false);
    script.onload = async () => {
      const google = (window as unknown as { google?: Gis }).google;
      if (!vivo || !google || !caja.current) return;
      const nonce = crypto.randomUUID();
      google.accounts.id.initialize({
        client_id: clientId,
        nonce: await sha256(nonce),
        use_fedcm_for_button: true,
        callback: async ({ credential }) => {
          const { data, error } = await createClient(url, key).auth.signInWithIdToken({ provider: "google", token: credential, nonce });
          if (error || !data.session) return onError("No pudimos entrar con Google. Intenta de nuevo o usa tu correo.");
          guardarCookie(data.session);
          router.push("/");
          router.refresh();
        },
      });
      google.accounts.id.renderButton(caja.current, {
        theme: "outline", size: "large", shape: "rectangular", text: "continue_with",
        logo_alignment: "center", locale: "es-419", width: Math.min(caja.current.offsetWidth || 320, 400),
      });
    };
    document.head.appendChild(script);
    return () => {
      vivo = false;
      script.remove();
    };
  }, [router, onError]);

  async function redirect() {
    if (!supabaseUrl || !supabaseAnonKey) return onError("Supabase no está configurado en este entorno.");
    const { error } = await createClient(supabaseUrl, supabaseAnonKey).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/callback` },
    });
    if (error) onError("Google no está disponible todavía. Usa tu correo.");
  }

  if (oficial) return <div ref={caja} className="auth-google-gis" aria-label="Continuar con Google" />;
  return (
    <button type="button" onClick={redirect} className="auth-google">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" /><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" /></svg>
      Continuar con Google
    </button>
  );
}
