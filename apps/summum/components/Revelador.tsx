"use client";

// Anima una sola vez lo que entra a la pantalla: marca data-visto en cada [data-anima] al aparecer y
// deja de observarlo (decisión del dueño 2026-10-20: entra una vez y se queda). Los estilos viven en
// app/globals.css y solo se activan con html[data-anima="on"], así que sin JS todo se ve quieto.
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function Revelador() {
  const ruta = usePathname();
  useEffect(() => {
    document.documentElement.dataset.anima = "on";
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          (e.target as HTMLElement).dataset.visto = "";
          io.unobserve(e.target);
        }),
      { threshold: 0.2 },
    );
    document.querySelectorAll<HTMLElement>("[data-anima]:not([data-visto])").forEach((el) => {
      // Las etiquetas se teclean: necesitan su número de caracteres para los pasos.
      if (el.dataset.anima === "etiqueta") el.style.setProperty("--c", String(Math.max(el.textContent?.length ?? 1, 1)));
      io.observe(el);
    });
    return () => io.disconnect();
  }, [ruta]);
  return null;
}
