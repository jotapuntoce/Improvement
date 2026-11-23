"use client";
// supabase-js guarda la sesión en localStorage con su refresh token y la renueva sola antes de que
// venza; esta hoja copia cada token nuevo a la cookie que lee server/auth/guard.ts. Sin esto la cookie
// moría a la hora y te sacaba al login. El "Salir" (LogoutButton) borra el localStorage, así que no
// revive una sesión cerrada.
import { useEffect } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function guardarCookie(session: Session) {
  document.cookie = `imp-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
}

export function SesionViva() {
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return;
    const { data } = createClient(supabaseUrl, supabaseAnonKey).auth.onAuthStateChange((_evento, session) => {
      if (session) guardarCookie(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
