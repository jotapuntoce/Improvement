// La configuración que abre el perfil de la empresa: tu perfil, tu empresa, tus otras empresas, tu
// contraseña y cerrar sesión. Lo profundo (indicadores, áreas, pagos) sigue en /empresas/configuracion.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findOwnerMembership, getSessionAccessToken, getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { logout } from "@/server/auth/logout.ts";
import { getMyProfile, updateMyAvatarPath, updateMyFullName, updateMyPhone } from "@/server/profile/mutations.ts";
import { uploadAvatar } from "@/server/storage/avatar.ts";
import { loadCompanies } from "@/server/companies/loadCompanies.ts";
import { updateCompanyIndustry } from "@/server/companies/mutations.ts";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries.ts";
import { LogoutButton } from "@/components/LogoutButton.tsx";
import { PasswordReset } from "./PasswordReset.tsx";

type Result = { ok: true } | { ok: false; error: { message: string } };

// A nivel de módulo: una Server Action no puede cerrar sobre una función. El org viaja en un campo
// oculto, pero quién escribe sale siempre de la sesión.
function finish(orgId: string, result: Result, aviso: string): never {
  const pagina = `/${orgId}/configuracion`;
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(`/${orgId}`, "layout");
  redirect(`${pagina}?ok=${encodeURIComponent(aviso)}`);
}

async function actor(formData: FormData) {
  const userId = await getSessionUserId();
  const orgId = formData.get("orgId")?.toString() ?? "";
  if (!userId || !orgId) notFound();
  return { userId, orgId };
}

async function guardarNombre(formData: FormData) {
  "use server";
  const { userId, orgId } = await actor(formData);
  finish(orgId, await updateMyFullName(userId, formData.get("fullName")?.toString() ?? ""), "Nombre guardado.");
}

async function guardarTelefono(formData: FormData) {
  "use server";
  const { userId, orgId } = await actor(formData);
  finish(orgId, await updateMyPhone(userId, formData.get("phone")?.toString() ?? ""), "Teléfono guardado.");
}

async function guardarFoto(formData: FormData) {
  "use server";
  const { userId, orgId } = await actor(formData);
  const token = await getSessionAccessToken();
  const file = formData.get("foto");
  if (!token || !(file instanceof File) || file.size === 0) {
    finish(orgId, { ok: false, error: { message: "Elige una foto." } }, "");
  }
  const uploaded = await uploadAvatar(userId, token, file);
  finish(orgId, uploaded.ok ? await updateMyAvatarPath(userId, uploaded.data) : uploaded, "Foto guardada.");
}

async function guardarGiro(formData: FormData) {
  "use server";
  const { userId, orgId } = await actor(formData);
  finish(orgId, await updateCompanyIndustry(userId, orgId, formData.get("industry")?.toString() ?? ""), "Giro guardado.");
}

export default async function ConfiguracionPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { ok, error } = await searchParams;
  const { userId } = await requireOrgMembership(orgId);
  const [profile, companies, owner] = await Promise.all([
    getMyProfile(userId),
    loadCompanies(userId),
    findOwnerMembership(userId, orgId),
  ]);
  if (!profile) redirect("/login");
  const company = companies.find((c) => c.orgId === orgId);

  return (
    <main className="config-page">
      <h1 className="config-title">Configuración</h1>
      {ok && <p className="config-hint" role="status">{ok}</p>}
      {error && <p className="invite-error" role="alert">{error}</p>}

      <section className="config-card" aria-labelledby="cfg-perfil">
        <h2 id="cfg-perfil" className="config-card-title">Tu perfil</h2>
        <form action={guardarFoto} className="config-form">
          <input type="hidden" name="orgId" value={orgId} />
          {profile.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage
            <img src={profile.avatarUrl} alt="Tu foto actual" className="config-avatar-preview" />
          )}
          <label className="permiso-field">
            <span>Foto (JPG, PNG o WebP, máximo 2 MB)</span>
            <input type="file" name="foto" accept="image/jpeg,image/png,image/webp" required className="config-input" />
          </label>
          <button type="submit" className="panel-cta">Subir foto</button>
        </form>
        <form action={guardarNombre} className="config-form">
          <input type="hidden" name="orgId" value={orgId} />
          <label className="permiso-field">
            <span>Nombre</span>
            <input name="fullName" defaultValue={profile.fullName ?? ""} required className="config-input" />
          </label>
          <button type="submit" className="panel-cta">Guardar nombre</button>
        </form>
        <form action={guardarTelefono} className="config-form">
          <input type="hidden" name="orgId" value={orgId} />
          <label className="permiso-field">
            <span>Teléfono</span>
            <input name="phone" type="tel" defaultValue={profile.phone ?? ""} className="config-input" />
          </label>
          <button type="submit" className="panel-cta">Guardar teléfono</button>
        </form>
        <p className="config-hint">Correo: {profile.email}</p>
      </section>

      {owner && company && (
        <section className="config-card" aria-labelledby="cfg-empresa">
          <h2 id="cfg-empresa" className="config-card-title">Tu empresa: {company.name}</h2>
          <form action={guardarGiro} className="config-form">
            <input type="hidden" name="orgId" value={orgId} />
            <label className="permiso-field">
              <span>Giro</span>
              <select name="industry" defaultValue={company.industry ?? "otro"} className="config-input">
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="panel-cta">Guardar giro</button>
          </form>
          <ul className="config-links">
            <li><Link href={`/${orgId}/configuracion/marca`}>Tu marca (logo y colores)</Link></li>
            <li><Link href={`/${orgId}/equipo`}>Equipo y permisos</Link></li>
            <li><Link href={`/${orgId}/aplicaciones/nueva`}>Agregar aplicación</Link></li>
            <li><Link href={`/${orgId}/automatizaciones`}>Automatizaciones</Link></li>
            <li><Link href="/empresas/configuracion">Indicadores, áreas y pagos</Link></li>
          </ul>
        </section>
      )}

      <section className="config-card" aria-labelledby="cfg-empresas">
        <h2 id="cfg-empresas" className="config-card-title">Tus empresas</h2>
        <ul className="config-links">
          {companies.map((c) => (
            <li key={c.orgId}>
              <Link href={`/${c.orgId}`} aria-current={c.orgId === orgId ? "page" : undefined}>{c.name}</Link>
            </li>
          ))}
          <li><Link href="/empresas">Ver el panel de todas tus empresas</Link></li>
        </ul>
      </section>

      <section className="config-card" aria-labelledby="cfg-seguridad">
        <h2 id="cfg-seguridad" className="config-card-title">Contraseña</h2>
        <PasswordReset email={profile.email} />
      </section>

      <section className="config-card" aria-labelledby="cfg-sesion">
        <h2 id="cfg-sesion" className="config-card-title">Sesión</h2>
        <LogoutButton action={logout} label="Cerrar sesión" className="panel-btn-ghost config-btn--danger" />
      </section>
    </main>
  );
}
