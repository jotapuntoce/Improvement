"use client";

// La Server Action llega como prop, no importada: components/** no puede importar server/** (tabla
// de boundaries del CLAUDE.md). Mismo cruce que ya usa apps/admin/app/login/page.js con signIn.
//
// Es "use client" solo por el localStorage: @supabase/supabase-js guarda ahí el refresh token al
// iniciar sesión, y borrar la cookie no lo toca. Dejarlo vivo después de un "Salir" deja la sesión
// recuperable en una computadora compartida, así que se limpia antes de enviar el form.
const SUPABASE_STORAGE_PREFIX = "sb-";

export function LogoutButton({ action }: { action: () => Promise<void> }) {
  function clearSupabaseStorage() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(SUPABASE_STORAGE_PREFIX)) localStorage.removeItem(key);
      }
    } catch {
      // localStorage puede lanzar (modo privado, cookies bloqueadas). La cookie igual se borra en el
      // servidor, que es lo que decide la sesión — no hay razón para frenar el logout por esto.
    }
  }

  return (
    <form action={action}>
      <button type="submit" className="jpc-back-link jpc-back-link--fixed" onClick={clearSupabaseStorage}>
        Salir
      </button>
    </form>
  );
}
