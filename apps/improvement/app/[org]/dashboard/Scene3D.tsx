"use client";

// Monta <Canvas> de @react-three/fiber con el grafo ya calculado como props (nunca abre su propia
// conexión a datos — eso lo hace server/scene/loadDashboardScene.ts). Si no hay contexto WebGL,
// cae a SceneListFallback (misma data, lista). La lectura de prefers-reduced-motion ocurre aquí
// (solo aquí hay `window`); la decisión que importa probar vive en la función pura
// shouldAutoRotate() de sceneGraph.ts.
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { shouldAutoRotate, type SceneGraph } from "@/server/scene/sceneGraph";

const STATUS_COLOR: Record<string, string> = {
  alerta: "#f87171",
  activo: "#22d3ee",
  ok: "#10b981",
};

function detectWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function SceneListFallback({ graph }: { graph: SceneGraph }) {
  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <section>
        <h2 style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0 0 8px" }}>Áreas</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          {graph.zones.map((zone) => (
            <li key={zone.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: zone.color }} />
              {zone.name}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0 0 8px" }}>Equipo</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          {graph.avatars.map((avatar) => (
            <li key={avatar.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: STATUS_COLOR[avatar.status] ?? STATUS_COLOR.ok,
                }}
              />
              {avatar.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function Scene3D({ graph }: { graph: SceneGraph }) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    // Hidrata estado que solo existe en el navegador (soporte WebGL, prefers-reduced-motion) — no
    // hay forma de leerlo durante el render del servidor, así que este setState síncrono en el
    // mount es intencional (mismo patrón ya usado en apps/admin/app/improvement/page.js).
    // ?fallback=1 fuerza SceneListFallback aunque haya WebGL — usado por tests/e2e/a11y.spec.ts
    // (E3-T4): axe-core no puede auditar un <canvas> WebGL de forma significativa.
    const forceFallback = new URLSearchParams(window.location.search).has("fallback");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebglSupported(forceFallback ? false : detectWebgl());
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setAutoRotate(shouldAutoRotate(prefersReducedMotion));
  }, []);

  // null = todavía sin resolver del lado del cliente — evita parpadear entre Canvas y fallback.
  if (webglSupported === null) return null;
  if (!webglSupported) return <SceneListFallback graph={graph} />;

  return (
    <Canvas camera={{ position: [0, 8, 14], fov: 50 }} style={{ width: "100%", height: "100%" }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      {graph.zones.map((zone) => (
        <mesh key={zone.id} position={zone.position}>
          <boxGeometry args={[4, 0.4, 4]} />
          <meshStandardMaterial color={zone.color} />
        </mesh>
      ))}
      {graph.avatars.map((avatar) => (
        <mesh key={avatar.id} position={avatar.position}>
          <cylinderGeometry args={[0.4, 0.4, 1.4, 12]} />
          <meshStandardMaterial color={STATUS_COLOR[avatar.status] ?? STATUS_COLOR.ok} />
        </mesh>
      ))}
      <OrbitControls autoRotate={autoRotate} enablePan={false} />
    </Canvas>
  );
}
