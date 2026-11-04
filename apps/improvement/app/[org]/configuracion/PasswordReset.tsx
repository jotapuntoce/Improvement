"use client";
// Cambiar contraseña = Supabase manda un enlace al correo; el enlace abre /auth/nueva-contrasena.
// Del lado del cliente como el registro: solo usa la anon key y nunca ve la contraseña actual.
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function PasswordReset({ email }: { email: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function send() {
    if (!supabaseUrl || !supabaseAnonKey) return setStatus("No se pudo mandar el enlace en este entorno.");
    setStatus("Mandando…");
    const { error } = await createClient(supabaseUrl, supabaseAnonKey).auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/nueva-contrasena`,
    });
    setStatus(error ? "No se pudo mandar el enlace. Intenta en unos minutos." : `Te mandamos un enlace a ${email}.`);
  }

  return (
    <div className="config-form">
      <button type="button" onClick={send} className="panel-btn-ghost">Cambiar contraseña</button>
      {status && <p className="config-hint" role="status">{status}</p>}
    </div>
  );
}
