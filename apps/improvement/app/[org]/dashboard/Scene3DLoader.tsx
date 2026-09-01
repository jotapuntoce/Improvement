"use client";

// next/dynamic con ssr:false ya no se permite dentro de un Server Component (Next 16) — tiene que
// vivir en un Client Component. page.tsx (server) importa este wrapper en vez de llamar dynamic()
// directo; Scene3D en sí mismo decide su propio fallback si no hay WebGL.
import dynamic from "next/dynamic";
import type { SceneGraph } from "@/server/scene/sceneGraph";

const Scene3D = dynamic(() => import("./Scene3D.tsx").then((m) => m.Scene3D), { ssr: false });

export function Scene3DLoader({ graph }: { graph: SceneGraph }) {
  return <Scene3D graph={graph} />;
}
