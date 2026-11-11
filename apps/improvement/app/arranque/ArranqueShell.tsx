// La pantalla del arranque: una sola, con la ruta de 4 pasos en medio, la conversación a la izquierda
// y "Tu Improvement, armándose" a la derecha (en teléfono la tarjeta baja). Salir siempre arriba.
import { Constelacion } from "@/components/auth/Constelacion.tsx";
import { Isotipo } from "@/components/brand/Isotipo.tsx";
import { LogoutButton } from "@/components/LogoutButton.tsx";
import { Armado } from "@/components/arranque/Armado.tsx";
import type { ArmadoData } from "@/components/arranque/armadoDatos.ts";
import { logout } from "@/server/auth/logout.ts";

const PASOS = ["Tu negocio", "Tu marca", "Tus apps", "Tus datos"];

export function ArranqueShell({ paso, armado, children }: { paso: 1 | 2 | 3 | 4; armado: ArmadoData; children: React.ReactNode }) {
  return (
    <main className="arr-page">
      <Constelacion />
      <header className="arr-top">
        <span className="arr-brand"><Isotipo />Improvement</span>
        <LogoutButton action={logout} className="arr-salir" />
      </header>
      <ol className="arr-ruta" aria-label={`Paso ${paso} de ${PASOS.length}`}>
        {PASOS.map((t, i) => {
          const n = i + 1;
          const estado = n < paso ? "is-done" : n === paso ? "is-cur" : "";
          return (
            <li key={t} className={estado} aria-current={n === paso ? "step" : undefined}>
              <b aria-hidden="true">{n < paso ? "✓" : n}</b>
              <span>{t}</span>
            </li>
          );
        })}
      </ol>
      <div className="arr-cols">
        {children}
        <Armado initial={armado} />
      </div>
    </main>
  );
}
