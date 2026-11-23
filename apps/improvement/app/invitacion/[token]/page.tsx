// Aceptación de invitación. Fuera de [org] a propósito: quien entra aquí todavía no es miembro de
// nada, así que no puede pasar por requireOrgMembership.
//
// Mismo diseño que /login y /recuperar: constelación, isotipo y tarjeta auth-card.
import { getSessionUser } from "@/server/auth/guard";
import { findOpenInvitation } from "@/server/invitations/loadInvitations";
import { acceptInvitation } from "@/server/invitations/mutations";
import { listAreasByOrg } from "@/server/areas/listAreas.ts";
import { Isotipo } from "@/components/brand/Isotipo.tsx";
import { Constelacion } from "@/components/auth/Constelacion.tsx";
import { AcceptForm } from "./AcceptForm.tsx";

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitacion = await findOpenInvitation(token);

  // Sin decir de qué empresa era: quien tiene un token muerto no tiene por qué enterarse de que esa
  // empresa existe.
  if (!invitacion) {
    return (
      <main className="auth-shell">
        <Constelacion />
        <div className="auth-card auth-card-center">
          <Isotipo variante="red" className="auth-logo" />
          <h1 className="auth-title">Este enlace ya no sirve</h1>
          <p className="auth-sub">
            Puede que ya lo hayas usado o que haya vencido. Pídele a quien te invitó que te mande uno
            nuevo.
          </p>
        </div>
      </main>
    );
  }

  const areas = (await listAreasByOrg([invitacion.orgId])).get(invitacion.orgId) ?? [];

  async function aceptar(form: {
    fullName: string;
    phone: string;
    areaId: string | null;
    jobTitle: string;
    responsibilities: string;
  }) {
    "use server";
    const user = await getSessionUser();
    if (!user) return { ok: false, message: "No pudimos confirmar tu cuenta. Vuelve a intentar." };

    const result = await acceptInvitation(token, user, form);
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, orgId: result.data.orgId };
  }

  return (
    <main className="auth-shell">
      <Constelacion />
      <AcceptForm
        email={invitacion.email}
        orgName={invitacion.orgName}
        areas={areas}
        accept={aceptar}
      />
    </main>
  );
}
