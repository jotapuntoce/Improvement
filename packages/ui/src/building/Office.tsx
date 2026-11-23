// La oficina 2D en pixel-art: un SVG sin estado ni animación (nada que reducir con
// prefers-reduced-motion). Los colores vienen de area.color (datos) o de tokens — ningún hex nuevo.
import { officeScene, TILE, type SceneZone, type ScenePerson } from "./officeScene.ts";

export interface OfficeProps {
  orgName: string;
  zones: readonly SceneZone[];
  people: readonly ScenePerson[];
}

const AVATAR = 12;

const visuallyHidden = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

export function Office({ orgName, zones, people }: OfficeProps) {
  const scene = officeScene(zones, people);
  return (
    <div>
      <svg
        viewBox="0 0 640 384"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Oficina de ${orgName}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {scene.rects.map((r) => (
          <g key={`${r.kind}-${r.areaId ?? r.label}`}>
            <rect
              data-zone={r.kind}
              x={r.px - TILE}
              y={r.py - TILE}
              width={r.pw}
              height={r.ph}
              fill={r.kind === "area" && r.color ? r.color : "var(--bg-card)"}
              stroke="var(--border)"
            />
            <text x={r.px - TILE + 4} y={r.py - TILE + 11} fontSize={9} fill="var(--text-primary)">
              {r.label}
            </text>
            {r.areaId && scene.overflow[r.areaId] ? (
              <text
                x={r.px - TILE + r.pw - 4}
                y={r.py - TILE + r.ph - 4}
                fontSize={9}
                textAnchor="end"
                fill="var(--text-primary)"
              >
                +{scene.overflow[r.areaId]}
              </text>
            ) : null}
          </g>
        ))}
        {scene.avatars.map((a) => {
          const x = (a.tx - 1) * TILE + (TILE - AVATAR) / 2;
          const y = (a.ty - 1) * TILE + (TILE - AVATAR) / 2;
          return (
            <g key={a.profileId}>
              <title>{a.name}</title>
              <rect x={x} y={y} width={AVATAR} height={AVATAR} fill="var(--bg)" stroke="var(--text-primary)" />
              <text x={x + AVATAR / 2} y={y + 9} fontSize={6} textAnchor="middle" fill="var(--text-primary)">
                {a.initials}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="sr-only" style={visuallyHidden}>
        {zones
          .filter((z) => z.kind === "area")
          .map((z) => {
            const gente = people.filter((p) => p.areaId === z.areaId).map((p) => p.name);
            return (
              <li key={z.areaId ?? z.label}>
                {z.label}: {gente.length ? gente.join(", ") : "sin personas"}
              </li>
            );
          })}
      </ul>
    </div>
  );
}
