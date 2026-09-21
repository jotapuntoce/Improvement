// El rastreador de construcción, como el de una pizzería: las 8 fases siempre visibles y un punto
// que marca en cuál va tu empresa. Server Component — el selector de empresa son <Link>s con
// ?empresa=, no estado de cliente, así que esta parte del panel no lleva JavaScript.
import Link from "next/link";
import type { PanelCompany } from "@/server/companies/loadOwnerPanel";

function stageClass(index: number, currentIndex: number): string {
  if (currentIndex === -1) return "tracker-step";
  if (index < currentIndex) return "tracker-step tracker-step--done";
  if (index === currentIndex) return "tracker-step tracker-step--current";
  return "tracker-step";
}

export function BuildTracker({
  companies,
  selected,
}: {
  companies: PanelCompany[];
  selected: PanelCompany;
}) {
  const { stages, currentIndex } = selected;
  const current = currentIndex >= 0 ? stages[currentIndex] : null;

  return (
    <section className="tracker" aria-label="Construcción de tu empresa digital">
      {/* El selector solo existe cuando hay algo entre qué elegir: con una sola empresa dibujarlo
          sería un control que nunca cambia nada. */}
      {companies.length > 1 && (
        <nav className="tracker-switcher" aria-label="Elegir empresa">
          {companies.map((c) => (
            <Link
              key={c.key}
              href={`/empresas?empresa=${encodeURIComponent(c.key)}`}
              className={c.key === selected.key ? "tracker-chip tracker-chip--on" : "tracker-chip"}
              aria-current={c.key === selected.key ? "true" : undefined}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      {stages.length === 0 ? (
        <p className="tracker-empty">
          {selected.status === "rechazada"
            ? "Esta solicitud no fue aprobada. Escríbenos si quieres retomarla."
            : "Todavía no hay fases registradas para esta empresa."}
        </p>
      ) : (
        <>
          <ol className="tracker-rail">
            {stages.map((stage, i) => (
              <li key={stage.stageOrder} className={stageClass(i, currentIndex)}>
                <span className="tracker-dot" aria-hidden="true" />
                <span className="tracker-step-name">{stage.stageName}</span>
              </li>
            ))}
          </ol>
          {current && (
            <p className="tracker-current">
              <span className="tracker-current-badge">
                Paso {currentIndex + 1} de {stages.length}
              </span>
              {selected.name} va en <strong>{current.stageName}</strong>
            </p>
          )}
        </>
      )}
    </section>
  );
}
