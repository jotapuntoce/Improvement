// Fixtures de prueba reutilizables entre apps — crea/borra un usuario real de Supabase Auth vía la
// service-role key. Vive en packages/db, NO en apps/improvement: esa key nunca se importa ahí
// (Non-negotiable #3, "solo se importa en código server-only de apps/admin, nunca en
// apps/improvement") — packages/db es infraestructura compartida que ninguna app embebe en su
// bundle de producción, solo la consumen scripts de prueba/seed (aquí: tests/e2e/a11y.spec.ts de
// E3-T4, que necesita una sesión real para visitar rutas protegidas por requireOrgMembership).
//
// No carga ningún .env por sí mismo (nada de import.meta.url — el transform de TS de Playwright no
// lo resuelve bien al cruzar de paquete): asume que el proceso llamador ya cargó lo necesario. Para
// tests/e2e/a11y.spec.ts eso lo hace tests/e2e/global-setup.ts, cargando el .env.local de la raíz —
// así apps/improvement nunca necesita tener SUPABASE_SERVICE_ROLE_KEY en ninguno de sus propios .env.
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no está definida — necesaria para fixtures de prueba`);
  return value;
}

function adminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear el usuario de prueba: ${error?.message ?? "sin detalle"}`);
  }
  return data.user.id;
}

export async function deleteTestAuthUser(userId: string): Promise<void> {
  await adminClient()
    .auth.admin.deleteUser(userId)
    .catch(() => {});
}

export async function signInTestUser(email: string, password: string): Promise<string> {
  const anon = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesión de prueba: ${error?.message ?? "sin detalle"}`);
  }
  return data.session.access_token;
}
