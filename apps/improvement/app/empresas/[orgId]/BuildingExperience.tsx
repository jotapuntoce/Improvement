"use client";

// El panel de una empresa. Abre EN la recepción, no antes.
//
// Antes esto era edificio → zoom → una tarjeta que decía "Bienvenido de vuelta" → un botón para
// entrar al dashboard: tres clics y dos pantallas de saludo para llegar a lo que el dueño venía a
// hacer. Ahora entrar a su empresa lo deja directamente adentro, en una recepción de verdad —
// mostrador, sillas, el logo de su giro en la pared — y desde ahí abre lo que necesita.
//
// El edificio no se fue: es lo que se ve al salir a la calle ("Ver el edificio"), y ahí es donde
// enseña en qué etapa va la construcción de su empresa digital. Dejó de ser un peaje de entrada y
// pasó a ser lo que siempre debió: la vista de afuera.
//
// accent_color se aplica una sola vez, en este wrapper — Building.tsx y Reception.tsx lo heredan
// vía CSS custom property, ninguno de los dos lo recibe como prop.
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building } from "@jotapuntoce/ui/building/Building.tsx";
import { Reception } from "@jotapuntoce/ui/building/Reception.tsx";
import type { BuildingGraph } from "@/server/building/buildingGraph.ts";

export function BuildingExperience({
  orgId,
  graph,
  esDueno,
}: {
  orgId: string;
  graph: BuildingGraph;
  esDueno: boolean;
}) {
  const [afuera, setAfuera] = useState(false);
  const router = useRouter();

  const sceneStyle = graph.accentColor
    ? ({ "--building-accent": graph.accentColor } as CSSProperties)
    : undefined;

  if (afuera) {
    return (
      <div className="jpc-scene" style={sceneStyle}>
        {graph.areas.length === 0 && (
          <p className="jpc-scene-note">Tu empresa digital todavía no tiene áreas configuradas.</p>
        )}
        <Building
          companyName={graph.companyName}
          slogan={graph.slogan ?? undefined}
          areas={graph.areas}
          industry={graph.industry}
          progress={graph.progress}
          stageLabel={graph.stageLabel ?? undefined}
          onEnter={() => setAfuera(false)}
        />
      </div>
    );
  }

  return (
    <div className="jpc-scene" style={sceneStyle}>
      <Reception
        companyName={graph.companyName}
        greeting={graph.slogan ?? undefined}
        scene
        industry={graph.industry}
        backLabel="← Volver a mis empresas"
        onBack={() => router.push("/empresas")}
      >
        <button
          type="button"
          className="jpc-reception-submit"
          onClick={() => router.push(`/${orgId}/dashboard`)}
        >
          Entrar a tu empresa
        </button>
        <div className="jpc-reception-doors">
          <Link href={`/${orgId}/objetivos`} className="jpc-reception-door">
            Objetivos
          </Link>
          <Link href={`/${orgId}/equipo`} className="jpc-reception-door">
            Equipo
          </Link>
          {esDueno && (
            <>
              <Link href={`/${orgId}/necesidades`} className="jpc-reception-door">
                Lo que necesita
              </Link>
              <Link href={`/${orgId}/improvement`} className="jpc-reception-door">
                Improvement
              </Link>
            </>
          )}
          <button type="button" className="jpc-reception-door" onClick={() => setAfuera(true)}>
            Ver el edificio
          </button>
        </div>
      </Reception>
    </div>
  );
}
