"use server";

// Cerrar sesión = borrar la cookie que guard.ts lee. Server Action y no document.cookie a propósito:
// así sigue funcionando si algún día esta cookie pasa a httpOnly (como ya lo es la de apps/admin),
// sin tener que reescribir el botón. El access token que @supabase/supabase-js deja en localStorage
// lo limpia el botón del lado del cliente — el servidor no puede tocarlo.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("imp-access-token");
  redirect("/login");
}
