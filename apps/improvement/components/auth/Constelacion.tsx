"use client";
// Fondo del login: constelación verde que respira y se inclina hacia el cursor. Lee los colores de los
// tokens (--brand-improvement-*) y no corre con "reducir movimiento"; en pantallas chicas va menos densa.
import { useEffect, useRef } from "react";

export function Constelacion() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const c1 = css.getPropertyValue("--brand-improvement-1").trim();
    const c2 = css.getPropertyValue("--brand-improvement-2").trim();
    let W = 0, H = 0, mx = 0, my = 0, raf = 0;
    let pts: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    const size = () => {
      const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
      W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      pts = Array.from({ length: Math.round((W * H) / (W < 700 ? 7000 : 5200)) }, () => ({
        x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, r: Math.random() * 1.6 + 0.4,
      }));
    };
    const move = (e: PointerEvent) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; };
    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const ox = mx * 30, oy = my * 30, br = 1 + Math.sin(t / 1400) * 0.04;
      const P = (p: { x: number; y: number }): [number, number] => [(p.x - W / 2) * br + W / 2 + ox, (p.y - H / 2) * br + H / 2 + oy];
      for (const p of pts) { p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H; }
      ctx.strokeStyle = c1;
      for (const [i, a] of pts.entries()) {
        const [ax, ay] = P(a);
        for (const b of pts.slice(i + 1)) {
          const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
          if (d2 < 9000) {
            const [bx, by] = P(b);
            ctx.globalAlpha = (1 - d2 / 9000) * 0.35;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          }
        }
        ctx.globalAlpha = 0.9; ctx.fillStyle = a.r > 1.4 ? c2 : c1;
        ctx.beginPath(); ctx.arc(ax, ay, a.r, 0, 6.3); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    size();
    addEventListener("resize", size);
    addEventListener("pointermove", move);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointermove", move); };
  }, []);
  return <canvas ref={ref} className="auth-canvas" aria-hidden="true" />;
}
