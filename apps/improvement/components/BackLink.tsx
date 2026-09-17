// Un solo nivel hacia arriba, siempre visible. Reutiliza .jpc-back-link (packages/ui/building.css),
// la misma clase del "← Volver afuera" de Reception.tsx — la variante --fixed solo la despega del
// flujo para que funcione igual sobre una escena 3D a pantalla completa (el dashboard) que sobre una
// página con padding normal (objetivos, equipo).
import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="jpc-back-link jpc-back-link--fixed">
      ← {label}
    </Link>
  );
}
