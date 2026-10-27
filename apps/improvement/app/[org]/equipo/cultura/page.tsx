// Cultura: celebraciones automáticas (objetivos cerrados y aniversarios) y, para quien ve a toda la
// empresa, el ánimo agregado de las últimas semanas. Nada por persona, nada ordenado por desempeño.
import { requireSection } from "@/server/auth/guard.ts";
import { celebrations, cultureInsights } from "@/server/people/culture.ts";

const MOOD_LABEL = ["", "Muy mal", "Mal", "Regular", "Bien", "Muy bien"];

export default async function CulturaPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const { membership } = await requireSection(orgId, "equipo");
  const userId = membership.userId;
  const [list, insights] = await Promise.all([celebrations(userId, orgId), cultureInsights(userId, orgId)]);

  return (
    <main className="config-page">
      <h1 className="config-title">Cultura</h1>

      <section className="config-card" aria-labelledby="celebraciones">
        <h2 id="celebraciones" className="config-card-title">
          Para celebrar
        </h2>
        <ul className="equipo-list">
          {list.map((c, i) =>
            c.kind === "objetivo" ? (
              <li key={i}>
                {c.personName ?? "El equipo"} cerró «{c.title}»
              </li>
            ) : (
              <li key={i}>
                {c.personName ?? "Alguien del equipo"} cumple {c.years} {c.years === 1 ? "año" : "años"} con nosotros el {c.on}
              </li>
            ),
          )}
          {list.length === 0 && <li className="config-hint">Nada que celebrar esta semana… todavía.</li>}
        </ul>
      </section>

      {insights.ok && (
        <section className="config-card" aria-labelledby="animo">
          <h2 id="animo" className="config-card-title">
            Ánimo del equipo
          </h2>
          <table>
            <caption>Promedio de los check-ins de las últimas 4 semanas</caption>
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col">Respuestas</th>
                <th scope="col">Ánimo promedio</th>
              </tr>
            </thead>
            <tbody>
              {insights.data.map((w) => (
                <tr key={w.weekStart}>
                  <th scope="row">{w.weekStart}</th>
                  <td>{w.responses}</td>
                  <td>{w.averageMood === null ? "Muy pocas respuestas para mostrar" : MOOD_LABEL[w.averageMood]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
