"use server";

// Cerrar sesión del panel. Aquí la Server Action no es una preferencia: app/login/page.js pone
// `sb-access-token` con httpOnly, así que el navegador no puede borrarla por document.cookie — solo
// el servidor. Carpeta sin page.js a propósito: /logout no es una pantalla, solo aloja esta acción.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete("sb-access-token");
  redirect("/login");
}
