"use client";

// Orquesta la transición: edificio -> zoom -> recepción -> dashboard real. Mismo patrón que
// apps/admin/components/building/LoginExperience.js, pero el botón final de la recepción navega en
// vez de someter un login (Jaime ya está autenticado al llegar aquí — requireOrgMembership ya
// corrió en page.tsx). accent_color de la organización se aplica una sola vez, en este wrapper —
// Building.tsx y Reception.tsx lo heredan vía CSS custom property, ninguno de los dos lo recibe
// como prop.
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Building } from "@jotapuntoce/ui/building/Building.tsx";
import { Reception } from "@jotapuntoce/ui/building/Reception.tsx";
import type { BuildingGraph } from "@/server/building/buildingGraph.ts";

export function BuildingExperience({ orgId, graph }: { orgId: string; graph: BuildingGraph }) {
  const [entered, setEntered] = useState(false);
  const router = useRouter();

  const sceneStyle = graph.accentColor
    ? ({ "--building-accent": graph.accentColor } as CSSProperties)
    : undefined;

  return (
    <div className="jpc-scene" style={sceneStyle}>
      {entered ? (
        <Reception companyName={graph.companyName} greeting="Bienvenido de vuelta" onBack={() => setEntered(false)}>
          <button type="button" className="jpc-reception-submit" onClick={() => router.push(`/${orgId}/dashboard`)}>
            Entrar a tu dashboard
          </button>
        </Reception>
      ) : (
        <>
          {graph.areas.length === 0 && (
            <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
              Tu empresa digital todavía no tiene áreas configuradas.
            </p>
          )}
          <Building
            companyName={graph.companyName}
            slogan={graph.slogan ?? undefined}
            areas={graph.areas}
            onEnter={() => setEntered(true)}
          />
        </>
      )}
    </div>
  );
}
