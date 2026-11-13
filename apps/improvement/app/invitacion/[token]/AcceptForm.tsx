"use client";

// Una sola pantalla: contraseña + quién eres. El alta en Supabase Auth pasa AQUÍ, del lado del
// cliente con la llave anon — la service-role key no existe en esta app (Non-negotiable #3).
//
// La cookie `imp-access-token` se escribe igual que en /login (ver la nota larga en LoginForm.tsx
// sobre por qué el nombre lleva prefijo propio); la Server Action que sigue la lee para saber quién
// es quien acaba de registrarse, así que el id nunca viaja como campo del formulario.
//
// Mismo diseño que /login y /recuperar (auth-card, auth-field, auth-input, auth-primary).
// globals.css — no se agregó CSS nuevo, esta pantalla reusa lo que ya hay.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Isotipo } from "@/components/brand/Isotipo.tsx";

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

    // CRITICAL 2 (revisión de rama): signUp() era la ÚNICA vía a tener sesión. Si signUp creaba la
    // cuenta pero un reintento posterior la topaba con "user already registered" (p. ej. porque un
    // primer intento con un dato inválido ya la había dado de alta en Auth, aunque accept() lo
    // rechazara después), no había forma de recuperar la invitación — no existe ninguna ruta que
    // acepte con sesión ya iniciada. El servidor ya está listo para esta persona (acceptInvitation
    // hace onConflictDoUpdate sobre profile porque "la misma persona pudo haber entrado antes a otra
    // empresa del mismo dueño"); a este mismo caso lo tapaba el cliente. Mismo patrón que
    // /login/LoginForm.tsx: si signUp no da sesión, se intenta signInWithPassword con los mismos
    // datos antes de rendirse.
    let session = signUp.session;
    if (signUpError || !session) {
      const { data: signIn } = await supabase.auth.signInWithPassword({ email, password });
      session = signIn.session ?? null;
    }

    if (!session) {
      // Mensaje genérico a propósito: no delata si ese correo ya existía en Auth (podía haber sido
      // un teléfono corto la primera vez, o una contraseña que no es la que esta persona recuerda).
      setError("No se pudo entrar con esos datos. Revisa tu contraseña o inténtalo de nuevo.");
      setLoading(false);
      return;
    }

    document.cookie = `imp-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;

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

    // A su oficina, no a un menú: quien acaba de entrar a una empresa ve primero el edificio y
    // adentro la recepción, igual que cualquier otro día. La única entrada es la misma para todos.
    router.push(`/${result.orgId}/mi-agente`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="auth-card auth-card-center" aria-label="Aceptar invitación">
      <Isotipo variante="red" className="auth-logo" />
      <h1 className="auth-title">Te están esperando</h1>
      <p className="auth-sub">
        Te invitaron a <strong>{orgName}</strong> como <strong>{email}</strong>. Si ya tienes cuenta
        en Improvement, usa tu misma contraseña.
      </p>

      <label className="auth-field">
        <span>Tu contraseña</span>
        <input type="password" name="password" required minLength={8} autoComplete="current-password" className="auth-input" />
      </label>
      <Link href="/recuperar" className="auth-forgot">¿Olvidaste tu contraseña?</Link>
      <label className="auth-field">
        <span>Tu nombre completo</span>
        <input name="fullName" required autoComplete="name" className="auth-input" />
      </label>
      <label className="auth-field">
        <span>Tu teléfono</span>
        <input name="phone" type="tel" required minLength={7} autoComplete="tel" className="auth-input" />
      </label>
      {areas.length > 0 && (
        <label className="auth-field">
          <span>Tu área</span>
          <select name="areaId" defaultValue="" className="auth-input">
            <option value="">Sin área</option>
            {areas.map((areaChoice) => (
              <option key={areaChoice.id} value={areaChoice.id}>{areaChoice.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="auth-field">
        <span>Tu puesto</span>
        <input name="jobTitle" required className="auth-input" />
      </label>
      <label className="auth-field">
        <span>De qué te encargas</span>
        <textarea name="responsibilities" required rows={3} className="auth-input" />
      </label>

      {error && <p className="auth-error" role="alert">{error}</p>}

      <button type="submit" disabled={loading} className="auth-primary">
        {loading ? "Entrando..." : "Entrar a mi empresa"}
      </button>
    </form>
  );
}
