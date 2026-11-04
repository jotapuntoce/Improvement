"use client";
// Destino del enlace de "Cambiar contraseña": supabase-js lee la sesión de recuperación del fragmento
// de la URL, la persona escribe la nueva y entra (mismo atajo de cookie que /auth/callback).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MIN_LENGTH = 8;

export default function NuevaContrasena() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(formData: FormData) {
    const password = formData.get("password")?.toString() ?? "";
    if (password.length < MIN_LENGTH) return setError(`Usa al menos ${MIN_LENGTH} caracteres.`);
    if (password !== formData.get("confirm")?.toString()) return setError("Las dos contraseñas no coinciden.");
    if (!supabaseUrl || !supabaseAnonKey) return setError("No se puede cambiar en este entorno.");
    setPending(true);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    const { data } = await supabase.auth.getSession();
    setPending(false);
    if (updateError || !data.session) return setError("El enlace ya no sirve. Pide otro desde Configuración.");
    document.cookie = `imp-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax`;
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Nueva contraseña</h1>
      <form action={save} className="config-form config-form-stack config-card">
        <label className="permiso-field">
          <span>Nueva contraseña</span>
          <input name="password" type="password" autoComplete="new-password" required minLength={MIN_LENGTH} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Repítela</span>
          <input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_LENGTH} className="config-input" />
        </label>
        {error && <p className="invite-error" role="alert">{error}</p>}
        <button type="submit" disabled={pending} className="panel-cta">Guardar contraseña</button>
      </form>
    </main>
  );
}
