import { redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";

// `/` nunca es una página en sí — reparte: con sesión, al panel de empresas (/empresas, que a su
// vez lleva al edificio de la que elija y de ahí a su dashboard real); sin sesión, a /login.
export default async function Page() {
  const userId = await getSessionUserId();
  redirect(userId ? "/empresas" : "/login");
}
