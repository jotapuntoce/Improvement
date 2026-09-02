// Único punto no autenticado de apps/admin (excepción explícita de la regla de route protection —
// ver lib/auth.js). A diferencia de apps/improvement/app/login (que usa un LoginForm "use client" +
// document.cookie porque necesita @supabase/supabase-js en el navegador para múltiples usuarios por
// org), acá basta una Server Action pura: un solo operador (Jose Carlos), sin necesidad de
// NEXT_PUBLIC_SUPABASE_ANON_KEY, y con la cookie puesta httpOnly del lado del servidor — el
// comportamiento que el blueprint describe en su sección "Sessions" (httpOnly, Secure, SameSite=Lax).
//
// La presentación (edificio de noche + recepción) vive en components/building/LoginExperience.js —
// signIn se le pasa como prop; un Server Action puede cruzar a un Client Component así sin
// problema. app/layout.js oculta el Sidebar/Topbar específicamente en esta ruta (ver x-pathname).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "../../lib/db.js";
import LoginExperience from "@/components/building/LoginExperience";

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

  return <LoginExperience signInAction={signIn} hasError={hasError} />;
}
