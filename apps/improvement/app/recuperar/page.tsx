"use client";
// "¿Olvidaste tu contraseña?" del login: Supabase manda un enlace que abre /auth/nueva-contrasena.
// Mismo mensaje exista o no el correo, para no revelar quién tiene cuenta.
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Isotipo } from "@/components/brand/Isotipo.tsx";
import { Constelacion } from "@/components/auth/Constelacion.tsx";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function Recuperar() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"listo" | "mandando" | "enviado" | "error">("listo");

  async function mandar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseUrl || !supabaseAnonKey) return setEstado("error");
    setEstado("mandando");
    const { error } = await createClient(supabaseUrl, supabaseAnonKey).auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/nueva-contrasena`,
    });
    setEstado(error ? "error" : "enviado");
  }

  return (
    <main className="auth-shell">
      <Constelacion />
      <form onSubmit={mandar} className="auth-card auth-card-center" aria-label="Recuperar contraseña">
        <Isotipo variante="red" className="auth-logo" />
        <h1 className="auth-title">Recupera tu contraseña</h1>
        <p className="auth-sub">Escribe tu correo y te mandamos un enlace para crear una nueva.</p>
        {estado === "enviado" ? (
          <p className="auth-notice" role="status">
            Si {email} tiene cuenta, ya te llegó el enlace. Revisa también la carpeta de spam.
          </p>
        ) : (
          <>
            <label className="auth-field">
              Correo
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" />
            </label>
            {estado === "error" && <p className="auth-error" role="alert">No pudimos mandar el enlace. Intenta en unos minutos.</p>}
            <button type="submit" disabled={estado === "mandando"} className="auth-primary">
              {estado === "mandando" ? "Mandando..." : "Mandar enlace"}
            </button>
          </>
        )}
        <Link href="/login" className="auth-back">← Volver a entrar</Link>
      </form>
    </main>
  );
}
