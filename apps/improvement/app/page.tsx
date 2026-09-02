import { redirect } from "next/navigation";
import { resolveHomeOrgSlug } from "@/server/auth/guard.ts";

// `/` nunca es una página en sí — es solo el punto de entrada que reparte: con sesión y membership,
// al dashboard de ese org; sin ninguna de las dos, a /login. Reemplaza el placeholder estático del
// scaffold original (paso 2), que nunca se conectó a auth real.
export default async function Page() {
  const slug = await resolveHomeOrgSlug();
  redirect(slug ? `/${slug}/dashboard` : "/login");
}
