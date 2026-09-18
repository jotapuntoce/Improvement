"use client";

// Entrar a una empresa: edificio → recepción → lo que el dueño venga a hacer.
//
// El edificio ES la empresa, y es lo primero que se ve. No es un peaje: es la única pantalla del
// producto que contesta "¿cómo va mi empresa?" sin que nadie lea nada. Según la etapa del mapa de
// construcción se ve el terreno solo, los ingenieros midiéndolo, la obra levantándose, los acabados,
// el equipo afuera aprendiendo, el moño de entrega o la empresa completa y operando. La tabla de
// escenas vive en packages/ui/src/building/Building.tsx.
//
// Lo que sí se quitó fue el "Bienvenido de vuelta": la recepción ya no saluda: ahora es una
// recepción de verdad — mostrador, sillas, el logo del giro en la pared — con las puertas de la
// empresa a la mano.
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
  const [adentro, setAdentro] = useState(false);
  const router = useRouter();

  const sceneStyle = graph.accentColor
    ? ({ "--building-accent": graph.accentColor } as CSSProperties)
    : undefined;

  if (!adentro) {
    return (
      <div className="jpc-scene" style={sceneStyle}>
        <Building
          companyName={graph.companyName}
          slogan={graph.slogan ?? undefined}
          areas={graph.areas}
          industry={graph.industry}
          stageOrder={graph.stageOrder}
          stageLabel={graph.stageLabel ?? undefined}
          onEnter={() => setAdentro(true)}
        />
        <Link href="/empresas" className="jpc-back-link">
          ← Volver a mis empresas
        </Link>
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
        backLabel="← Salir a la calle"
        onBack={() => setAdentro(false)}
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
        </div>
      </Reception>
    </div>
  );
}
