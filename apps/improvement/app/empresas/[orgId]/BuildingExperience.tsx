"use client";

// Entrar a una empresa: edificio → recepción → lo que el dueño venga a hacer.
//
// El edificio ES la empresa, y es lo primero que se ve. No es un peaje: es la única pantalla del
// producto que contesta "¿cómo va mi empresa?" sin que nadie lea nada. Según la etapa del mapa de
// construcción se ve el terreno solo, los ingenieros midiéndolo, la obra levantándose, los acabados,
// el equipo afuera aprendiendo, el moño de entrega o la empresa completa y operando. La tabla de
// escenas vive en packages/ui/src/building/Building.tsx.
//
// Adentro ya no hay un mostrador con botones: hay una oficina. Cada sección de la empresa es un
// mueble —el pizarrón, el muro de retratos, la pantalla del mostrador, el letrero, el lector de la
// pared— y entrar a una sección es abrir su mueble. Los muebles son de tamaño fijo y no se mueven
// con los datos del día; lo que cambia es lo que traen adentro (packages/ui/src/building/Lobby.tsx).
//
// Cuáles se abren y cómo se llaman NO se decide aquí: llega resuelto desde el servidor, de
// organization.section_labels. El dueño apaga una sección y su mueble se queda ahí, visible pero
// mudo — la oficina no se reacomoda porque él haya apagado algo.
//
// Lo que no tiene mueble va abajo: el mapa de construcción (eso lo cuenta el edificio, desde la
// calle) y las dos herramientas que son solo del dueño.
//
// La paleta se aplica una sola vez, en este wrapper — Building.tsx y Lobby.tsx la heredan vía CSS
// custom properties, ninguno de los dos recibe un color como prop. Qué colores le tocan a esta
// empresa lo decidió el grafo, a partir de su giro (packages/ui/src/building/palettes.ts).
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Building } from "@jotapuntoce/ui/building/Building.tsx";
import { Lobby, type LobbyPuerta, type LobbyZona } from "@jotapuntoce/ui/building/Lobby.tsx";
import { paletteStyle } from "@jotapuntoce/ui/building/palettes.ts";
import type { BuildingGraph } from "@/server/building/buildingGraph.ts";
import type { LobbyGraph } from "@/server/lobby/loadLobby.ts";

export function BuildingExperience({
  orgId,
  graph,
  lobby,
  esDueno,
}: {
  orgId: string;
  graph: BuildingGraph;
  lobby: LobbyGraph;
  esDueno: boolean;
}) {
  const [adentro, setAdentro] = useState(false);

  const sceneStyle = paletteStyle(graph.palette) as CSSProperties;

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

  // Cada mueble que abre se envuelve en un <Link> de Next: la navegación es del app, no del
  // paquete de UI, que no sabe de rutas ni debe saber.
  const puertas: LobbyPuerta[] = lobby.puertas.map((p) => ({
    zona: p.zona,
    render: (contenido, className, style, aria) => (
      <Link
        key={p.zona}
        href={`/${orgId}/${p.slug}`}
        className={className}
        style={style}
        aria-label={aria}
      >
        {contenido}
      </Link>
    ),
  }));

  const labels = Object.fromEntries(
    lobby.puertas.map((p) => [p.zona, p.label]),
  ) as Partial<Record<LobbyZona, string>>;

  return (
    <div className="jpc-scene" style={sceneStyle}>
      <Lobby
        companyName={graph.companyName}
        industry={graph.industry}
        greeting={lobby.greeting}
        areas={graph.areas}
        team={lobby.team}
        projects={lobby.projects}
        objectivesOpen={lobby.objectivesOpen}
        clientsCount={lobby.clientsCount}
        powerupsCount={lobby.powerupsCount}
        labels={labels}
        puertas={puertas}
        footer={
          <>
            <div className="jpc-reception-doors">
              {lobby.sueltas.map((s) => (
                <Link key={s.slug} href={`/${orgId}/${s.slug}`} className="jpc-reception-door">
                  {s.label}
                </Link>
              ))}
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
            <button type="button" className="jpc-back-link" onClick={() => setAdentro(false)}>
              ← Salir a la calle
            </button>
          </>
        }
      />
    </div>
  );
}
