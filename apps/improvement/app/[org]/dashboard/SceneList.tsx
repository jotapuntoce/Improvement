// El dashboard en HTML plano: mismas áreas y mismo equipo que la escena 3D, con el punto de color
// del estado de cada quien. Nació como el fallback sin WebGL de Scene3D.tsx y hoy es la vista
// principal — Jose Carlos pidió dejar la renderización 3D fuera del proceso por ahora.
//
// Sin "use client" a propósito: no tiene estado ni eventos, así que se renderiza en el servidor y
// @react-three/fiber deja de viajar al navegador en esta ruta. Scene3D.tsx la sigue importando para
// cuando la escena se vuelva a encender (page.tsx es el único interruptor: un import).
import type { SceneGraph } from "@/server/scene/sceneGraph";

const STATUS_COLOR: Record<string, string> = {
  alerta: "var(--danger)",
  activo: "var(--accent-2)",
  ok: "var(--success)",
};

const dotStyle = { width: "10px", height: "10px", borderRadius: "50%" };
const listStyle = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column" as const,
  gap: "6px",
};
const headingStyle = { fontSize: "14px", color: "var(--text-secondary)", margin: "0 0 8px" };
const itemStyle = { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" };

export function SceneList({ graph }: { graph: SceneGraph }) {
  // Sin padding propio: el <main> de page.tsx ya lo da, y repetirlo aquí desalineaba estas dos
  // listas respecto de la navegación de arriba.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <section>
        <h2 style={headingStyle}>Áreas</h2>
        {graph.zones.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            Todavía no hay áreas configuradas.
          </p>
        ) : (
          <ul style={listStyle}>
            {graph.zones.map((zone) => (
              <li key={zone.id} style={itemStyle}>
                <span style={{ ...dotStyle, background: zone.color }} />
                {zone.name}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 style={headingStyle}>Equipo</h2>
        {graph.avatars.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            Todavía no hay nadie en el equipo.
          </p>
        ) : (
          <ul style={listStyle}>
            {graph.avatars.map((avatar) => (
              <li key={avatar.id} style={itemStyle}>
                <span style={{ ...dotStyle, background: STATUS_COLOR[avatar.status] ?? STATUS_COLOR.ok }} />
                {avatar.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
