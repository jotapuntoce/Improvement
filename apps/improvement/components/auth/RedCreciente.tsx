"use client";
// Fondo del registro: una retícula de puntos que va del gris suelto (izquierda, el dolor) a la red verde
// conectada (derecha, el alivio); por las conexiones verdes viajan pulsos hacia el formulario. Misma
// familia que la constelación del login, pero se arma en vez de flotar. Colores de los tokens; con
// "reducir movimiento" se dibuja una vez, quieta.
import { useEffect, useRef } from "react";

type Punto = { x: number; y: number; k: number };

export function RedCreciente() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const quieta = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = getComputedStyle(document.documentElement);
    const c1 = css.getPropertyValue("--brand-improvement-1").trim();
    const c2 = css.getPropertyValue("--brand-improvement-2").trim();
    const gris = css.getPropertyValue("--text-secondary").trim();
    let W = 0, H = 0, raf = 0;
    let pts: Punto[] = [], links: [Punto, Punto, number][] = [], pulsos: { l: [Punto, Punto, number]; s: number }[] = [];
    const size = () => {
      const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
      W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      const g = 46;
      pts = [];
      for (let y = g / 2; y < H; y += g)
        for (let x = g / 2; x < W; x += g) {
          const k = x / W, j = g * (1 - k) * 0.9;
          pts.push({ x: x + (Math.random() - 0.5) * j, y: y + (Math.random() - 0.5) * j, k });
        }
      links = [];
      for (const [i, a] of pts.entries())
        for (const b of pts.slice(i + 1)) {
          const k = (a.k + b.k) / 2;
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 52 * 52 && Math.random() < k * k * 1.3) links.push([a, b, k]);
        }
    };
    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = c1;
      for (const [a, b, k] of links) { ctx.globalAlpha = k * k * 0.45; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (const p of pts) {
        const brillo = quieta ? 1 : 0.75 + 0.25 * Math.sin(t / 900 + p.x * 0.05 + p.y * 0.03);
        const verde = p.k > 0.55;
        ctx.globalAlpha = verde ? (p.k - 0.3) * brillo : 0.18 + p.k * 0.3;
        ctx.fillStyle = verde ? c2 : gris;
        ctx.beginPath(); ctx.arc(p.x, p.y, verde ? 1.8 : 1.2, 0, 6.3); ctx.fill();
      }
      if (quieta) return;
      if (Math.random() < 0.12) { const l = links[Math.floor(Math.random() * links.length)]; if (l && l[2] > 0.5) pulsos.push({ l, s: 0 }); }
      pulsos = pulsos.filter((p) => (p.s += 0.02) < 1);
      ctx.globalAlpha = 1; ctx.fillStyle = c2; ctx.shadowColor = c1; ctx.shadowBlur = 8;
      for (const { l: [a, b], s } of pulsos) {
        const [x0, y0, x1, y1] = a.x < b.x ? [a.x, a.y, b.x, b.y] : [b.x, b.y, a.x, a.y];
        ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, 2, 0, 6.3); ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    };
    const redraw = () => { size(); if (quieta) frame(0); };
    redraw();
    addEventListener("resize", redraw);
    if (!quieta) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", redraw); };
  }, []);
  return <canvas ref={ref} className="auth-canvas auth-canvas-reg" aria-hidden="true" />;
}
