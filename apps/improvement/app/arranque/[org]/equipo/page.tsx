// Arranque, después de armar sus apps: quién de su equipo se encarga de qué. Cada persona recibe su
// invitación y su agente con lo que le toca (server/equipo/agentes.ts).
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { loadArmado } from "@/server/registro/onboarding.ts";
import { inviteTeam, teamSuggestion } from "@/server/equipo/agentes.ts";
import { EquipoForm, type EquipoEstado } from "@/components/arranque/EquipoForm.tsx";
import { ArranqueShell } from "../../ArranqueShell.tsx";

export default async function ArranqueEquipo({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await requireOrgMembership(orgId);
  const [armado, equipo] = await Promise.all([loadArmado(me.userId, orgId), teamSuggestion(me.userId, orgId)]);
  if (!armado.ok || !equipo.ok) notFound();
  // La URL pública (jotapuntoce.com/improvement), no el host de Vercel detrás del rewrite.
  const host = (await headers()).get("host") ?? "localhost:3200";
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${host.startsWith("localhost") ? "http" : "https"}://${host}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`;

  async function invitar(_prev: EquipoEstado, formData: FormData): Promise<EquipoEstado> {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const n = Math.min(Number(formData.get("filas")) || 0, 30);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const nombre = String(formData.get(`n-${i}`) ?? "").trim();
      const email = String(formData.get(`e-${i}`) ?? "").trim();
      if (!nombre && !email) continue; // Esa la deja para él.
      rows.push({ nombre, email, puesto: String(formData.get(`p-${i}`) ?? "").trim() || "Equipo", sucursal: String(formData.get(`s-${i}`) ?? "") || null, encargos: formData.getAll(`a-${i}`).map(String) });
    }
    if (!rows.length) return { error: "Pon el nombre y el correo de al menos una persona, o hazlo después." };
    const r = await inviteTeam(actor, orgId, rows, origin);
    return r.ok ? { invitados: r.data } : { error: r.error.message };
  }

  return (
    <ArranqueShell paso={3} armado={armado.data}>
      <EquipoForm action={invitar} sugeridas={equipo.data.sugeridas} apps={equipo.data.apps} next={`/arranque/${orgId}/importar`} />
    </ArranqueShell>
  );
}
