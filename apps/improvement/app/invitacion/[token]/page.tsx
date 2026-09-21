// Aceptación de invitación. Fuera de [org] a propósito: quien entra aquí todavía no es miembro de
// nada, así que no puede pasar por requireOrgMembership.
//
// Clases: config-page/config-title/config-hint — reales de globals.css (mismo criterio que
// /[org]/equipo/permisos y /[org]/equipo/invitar, Tareas 5 y 6); "permisos-page"/"permisos-title"/
// "permisos-hint" del brief original no existen.
import { getSessionUser } from "@/server/auth/guard";
import { findOpenInvitation } from "@/server/invitations/loadInvitations";
import { acceptInvitation } from "@/server/invitations/mutations";
import { listAreasByOrg } from "@/server/areas/listAreas.ts";
import { AcceptForm } from "./AcceptForm.tsx";

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitacion = await findOpenInvitation(token);

  // Sin decir de qué empresa era: quien tiene un token muerto no tiene por qué enterarse de que esa
  // empresa existe.
  if (!invitacion) {
    return (
      <main className="config-page">
        <h1 className="config-title">Este enlace ya no sirve</h1>
        <p className="config-hint">
          Puede que ya lo hayas usado o que haya vencido. Pídele a quien te invitó que te mande uno
          nuevo.
        </p>
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
    <main className="config-page">
      <h1 className="config-title">Te están esperando</h1>
      <AcceptForm
        email={invitacion.email}
        orgName={invitacion.orgName}
        areas={areas}
        accept={aceptar}
      />
    </main>
  );
}
