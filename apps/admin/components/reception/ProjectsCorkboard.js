// "Proyectos activos" — pizarrón de corcho con una nota por organización que tiene una etapa en
// 'en_progreso' (ver lib/orgStats.js getActiveProjects()). 100% datos reales, sin ejemplo: si no
// hay ninguna, solo se ve la tarjeta punteada invitando al próximo cliente. Server Component puro
// (sin animación por JS, solo la barra de progreso que ya anima por CSS al montar).
export default function ProjectsCorkboard({ projects = [] }) {
  return (
    <div className="board-mount">
      <p className="wall-label">
        <span className="wall-label-dot wall-label-dot-projects" />
        Proyectos activos
      </p>

      <div className="corkboard">
        {projects.map((project) => {
          const pct = project.totalCount > 0 ? Math.round((project.completedCount / project.totalCount) * 100) : 0;
          return (
            <div className="pin-card" key={project.id}>
              <span className="pin-dot" />
              <div className="pin-top">
                <span className="pin-title">{project.name}</span>
                <span className="pin-badge">EN PROGRESO</span>
              </div>
              <p className="pin-stage">Etapa actual: {project.currentStageName}</p>
              <div className="pin-progress">
                <span style={{ "--pct": `${pct}%` }} />
              </div>
              <p className="pin-progress-label">
                {project.completedCount} de {project.totalCount} etapas completadas
              </p>
            </div>
          );
        })}

        <div className="pin-card-ghost">
          <span>+ El próximo cliente aparece aquí</span>
        </div>
      </div>
    </div>
  );
}
