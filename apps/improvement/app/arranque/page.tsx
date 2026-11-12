// Arranque, paso 1 de 4: el negocio, como conversación con Improvement. Crea la empresa con quien llega
// como dueño y sigue con su marca.
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/guard.ts";
import { createOwnBusiness } from "@/server/registro/business.ts";
import { ARMADO_VACIO } from "@/components/arranque/armadoDatos.ts";
import { Conversacion } from "@/components/arranque/Conversacion.tsx";
import { ArranqueShell } from "./ArranqueShell.tsx";

const FIELDS = ["fullName", "name", "industry", "teamSize", "city"] as const;

export default async function Arranque({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await getSessionUser())) redirect("/login?returnTo=/arranque");
  const { error } = await searchParams;

  async function crear(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) notFound();
    const r = await createOwnBusiness(actor, Object.fromEntries(FIELDS.map((k) => [k, formData.get(k)?.toString() ?? ""])));
    if (!r.ok) redirect(`/arranque?error=${encodeURIComponent(r.error.message)}`);
    redirect(`/arranque/${r.data.orgId}/dolor`);
  }

  return (
    <ArranqueShell paso={1} armado={ARMADO_VACIO}>
      <Conversacion action={crear} error={error} />
    </ArranqueShell>
  );
}
