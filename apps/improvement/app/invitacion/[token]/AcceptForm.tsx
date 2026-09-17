"use client";

// Una sola pantalla: contraseña + quién eres. El alta en Supabase Auth pasa AQUÍ, del lado del
// cliente con la llave anon — la service-role key no existe en esta app (Non-negotiable #3).
//
// La cookie `imp-access-token` se escribe igual que en /login (ver la nota larga en LoginForm.tsx
// sobre por qué el nombre lleva prefijo propio); la Server Action que sigue la lee para saber quién
// es quien acaba de registrarse, así que el id nunca viaja como campo del formulario.
//
// Clases: config-page/config-title/config-hint/config-card/permiso-field/config-input/panel-cta —
// las mismas de /[org]/equipo/permisos y /[org]/equipo/invitar (Tareas 5 y 6). "permisos-page",
// "permisos-title", "permisos-hint", "permiso-name" y "config-btn" del brief original no existen en
// globals.css — no se agregó CSS nuevo, esta pantalla reusa lo que ya hay.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface AreaChoice {
  id: string;
  name: string;
}

export function AcceptForm({
  email,
  orgName,
  areas,
  accept,
}: {
  email: string;
  orgName: string;
  areas: AreaChoice[];
  accept: (form: {
    fullName: string;
    phone: string;
    areaId: string | null;
    jobTitle: string;
    responsibilities: string;
  }) => Promise<{ ok: boolean; message?: string; orgId?: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Supabase no está configurado en este entorno.");
      setLoading(false);
      return;
    }

    const data = new FormData(e.currentTarget);
    const password = data.get("password")?.toString() ?? "";
    if (password.length < 8) {
      setError("La contraseña necesita al menos 8 caracteres.");
      setLoading(false);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: signUp, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError || !signUp.session) {
      setError("No se pudo crear tu cuenta. Puede que ya exista — entra desde /login.");
      setLoading(false);
      return;
    }

    document.cookie = `imp-access-token=${signUp.session.access_token}; path=/; max-age=${signUp.session.expires_in}; SameSite=Lax`;

    const result = await accept({
      fullName: data.get("fullName")?.toString() ?? "",
      phone: data.get("phone")?.toString() ?? "",
      areaId: data.get("areaId")?.toString() || null,
      jobTitle: data.get("jobTitle")?.toString() ?? "",
      responsibilities: data.get("responsibilities")?.toString() ?? "",
    });

    if (!result.ok) {
      setError(result.message ?? "No se pudo completar tu registro.");
      setLoading(false);
      return;
    }

    router.push(`/${result.orgId}/dashboard`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="config-card">
      <p className="config-hint">
        Te invitaron a <strong>{orgName}</strong> como <strong>{email}</strong>.
      </p>

      <label className="permiso-field">
        <span>Crea tu contraseña</span>
        <input type="password" name="password" required minLength={8} className="config-input" />
      </label>
      <label className="permiso-field">
        <span>Tu nombre completo</span>
        <input name="fullName" required className="config-input" />
      </label>
      <label className="permiso-field">
        <span>Tu teléfono</span>
        <input name="phone" required className="config-input" />
      </label>
      {areas.length > 0 && (
        <label className="permiso-field">
          <span>Tu área</span>
          <select name="areaId" defaultValue="" className="config-input">
            <option value="">Sin área</option>
            {areas.map((areaChoice) => (
              <option key={areaChoice.id} value={areaChoice.id}>{areaChoice.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="permiso-field">
        <span>Tu puesto</span>
        <input name="jobTitle" required className="config-input" />
      </label>
      <label className="permiso-field">
        <span>De qué te encargas</span>
        <textarea name="responsibilities" required rows={3} className="config-input" />
      </label>

      {error && <p className="invite-error">{error}</p>}

      <button type="submit" disabled={loading} className="panel-cta">
        {loading ? "Entrando..." : "Entrar a mi empresa"}
      </button>
    </form>
  );
}
