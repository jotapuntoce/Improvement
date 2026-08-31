// Única importación de SUPABASE_SERVICE_ROLE_KEY en todo el repo (Non-negotiable #3 de CLAUDE.md) —
// necesaria para auth.admin.createUser() y otras llamadas de la API de Auth Admin de Supabase, que
// solo aceptan esta clave. Nunca se importa desde un archivo "use client" (verificado por el Verify
// de este paso con grep). El cliente Postgres directo (`db`, de @jotapuntoce/db) ya bypasea RLS por
// el rol de conexión — no necesita esta clave, solo se re-exporta aquí por conveniencia.
import { createClient } from "@supabase/supabase-js";

export { db } from "@jotapuntoce/db";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas — ver .env.example",
  );
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
