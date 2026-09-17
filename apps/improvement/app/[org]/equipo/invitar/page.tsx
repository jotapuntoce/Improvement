// Emitir una invitación. El enlace se muestra una sola vez, después de crearla: el token vive en la
// URL de vuelta (?token=) y nunca se vuelve a leer de la base, donde solo está su hash.
//
// Sin "use client": mismo criterio que /[org]/equipo/permisos — <form> nativo con Server Action, y
// las clases son las reales de globals.css (config-page, config-title, config-hint, config-card,
// config-input, panel-cta), no las inventadas en el brief original (permisos-page, permisos-title,
// permisos-hint, permiso-name, config-btn no existen).
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { requireOrgMembership } from "@/server/auth/guard";
import { createInvitation } from "@/server/invitations/mutations";
import { listPermissionTypes } from "@/server/permissions/mutations";
import { InviteLink } from "./InviteLink.tsx";

export default async function InvitarPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { token, error } = await searchParams;

  const member = await requireOrgMembership(orgId);
  if (member.role !== "owner") notFound();

  const tipos = await listPermissionTypes(orgId);
  const host = (await headers()).get("host") ?? "localhost:3200";
  const proto = host.startsWith("localhost") ? "http" : "https";

  async function invitar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const result = await createInvitation(
      row.userId,
      orgId,
      formData.get("email")?.toString() ?? "",
      formData.get("permissionTypeId")?.toString() ?? "",
    );
    if (!result.ok) redirect(`/${orgId}/equipo/invitar?error=${encodeURIComponent(result.error.message)}`);
    redirect(`/${orgId}/equipo/invitar?token=${result.data.token}`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Invitar a alguien</h1>

      {tipos.length === 0 ? (
        <p className="config-hint">
          Primero crea al menos un tipo de permiso — es lo que define qué va a ver esta persona.{" "}
          <Link href={`/${orgId}/equipo/permisos`}>Crear un tipo</Link>
        </p>
      ) : (
        <form action={invitar} className="config-card permiso-card">
          <label className="permiso-field">
            <span>Su correo</span>
            <input type="email" name="email" required className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Qué va a poder ver</span>
            <select name="permissionTypeId" required className="config-input">
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="panel-cta">
            Generar enlace
          </button>
        </form>
      )}

      {error && <p className="invite-error">{error}</p>}

      {token && (
        <div className="config-card">
          <p className="config-hint">
            Listo. Mándale este enlace por donde tú quieras. Vence en 7 días, sirve una sola vez y no
            se vuelve a mostrar.
          </p>
          <InviteLink url={`${proto}://${host}/invitacion/${token}`} />
        </div>
      )}

      <Link href={`/${orgId}/equipo`}>← Volver al equipo</Link>
    </main>
  );
}
