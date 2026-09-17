// La esquina superior izquierda del panel: foto, nombre y etiqueta del dueño.
//
// Server Component: no tiene estado ni eventos. La foto es un <Link> a configuración en vez de un
// input de archivo suelto — subirla, cambiar el nombre y elegir la etiqueta son la misma tarea y
// viven juntas en /empresas/configuracion, así el encabezado no arrastra JavaScript al navegador.
import Link from "next/link";
import { ownerLabelText } from "@jotapuntoce/ui/building/ownerLabels.ts";
import type { MyProfile } from "@/server/profile/mutations";

/** Iniciales como respaldo cuando todavía no hay foto — nunca un avatar vacío. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function OwnerHeader({ profile }: { profile: MyProfile }) {
  const displayName = profile.fullName ?? profile.email;
  const label = ownerLabelText(profile.ownerLabel);

  return (
    <header className="owner-header">
      <Link
        href="/empresas/configuracion"
        className="owner-avatar"
        aria-label={profile.avatarUrl ? "Cambiar tu foto" : "Agregar tu foto"}
      >
        {profile.avatarUrl ? (
          // El bucket de Supabase no está en images.remotePatterns y una foto de 56px no justifica
          // configurar el optimizador de next/image para una sola imagen.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="owner-avatar-img" />
        ) : (
          <span className="owner-avatar-initials" aria-hidden="true">
            {initials(displayName)}
          </span>
        )}
      </Link>

      <div className="owner-identity">
        <span className="owner-name">{displayName}</span>
        {label ? (
          <span className="owner-label-chip">{label}</span>
        ) : (
          <Link href="/empresas/configuracion" className="owner-label-chip owner-label-chip--empty">
            + Elegir etiqueta
          </Link>
        )}
      </div>
    </header>
  );
}
