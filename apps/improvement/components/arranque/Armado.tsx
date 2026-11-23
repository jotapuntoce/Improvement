"use client";
// "Tu Improvement, armándose": la tarjeta del arranque que se llena con cada respuesta del dueño.
// Parte de lo ya guardado (initial) y escucha el formulario del paso (id ARRANQUE_FORM): lo que el
// dueño escribe o elige aparece aquí antes de guardarse. Un campo vacío = todavía no contesta.
import { useEffect, useState } from "react";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries.ts";
import { ARRANQUE_FORM, leerFormulario, type ArmadoData } from "./armadoDatos.ts";

const BASE = ["Clientes", "Ventas", "Proyectos", "Postventa"];

export function Armado({ initial }: { initial: ArmadoData }) {
  const [d, setD] = useState(initial);
  const [logo, setLogo] = useState(initial.logoUrl);

  useEffect(() => {
    const form = document.getElementById(ARRANQUE_FORM);
    if (!(form instanceof HTMLFormElement)) return;
    let blob: string | null = null;
    const read = (e?: Event) => {
      setD(leerFormulario(form, initial));
      const t = e?.target;
      if (t instanceof HTMLInputElement && t.type === "file" && t.name === "logo") {
        const file = t.files?.[0];
        if (blob) URL.revokeObjectURL(blob);
        blob = file ? URL.createObjectURL(file) : null;
        setLogo(blob ?? initial.logoUrl);
      }
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [initial]);

  const giro = INDUSTRIES.find((i) => i.id === d.industry)?.label ?? null;
  const sub = [giro, d.city].filter(Boolean).join(" · ") || (d.ownerName ? `de ${d.ownerName}` : "…");
  const iniciales = (d.name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  // Los colores del negocio son datos (como brandStyle): entran como variables, nunca como clase.
  const style = {
    ...(d.primaryColor && { "--arr-c1": d.primaryColor }),
    ...(d.secondaryColor && { "--arr-c2": d.secondaryColor }),
  } as React.CSSProperties;

  return (
    <aside className="arr-armado" aria-label="Tu Improvement, armándose">
      <p className="arr-armado-label">Tu Improvement, armándose</p>
      <div className="arr-card" style={style}>
        <div className="arr-card-head">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo del negocio (Storage o blob: local), no pasa por next/image
            <img src={logo} alt="" className="arr-card-logo" />
          ) : (
            <span className="arr-card-logo" aria-hidden="true">{iniciales}</span>
          )}
          <div>
            <p className="arr-card-name">{d.name ?? "Tu negocio"}</p>
            <p className="arr-card-sub">{sub}</p>
          </div>
        </div>
        <ul className="arr-tiles">
          {BASE.map((n) => <li key={n}>{n}</li>)}
          {d.apps.map((n, i) => <li key={`${i}-${n}`} className="is-new">{n}</li>)}
          {d.apps.length === 0 && <li className="is-ghost">{giro ? `Tus apps de ${giro.toLowerCase()}` : "Tus apps"}</li>}
        </ul>
      </div>
    </aside>
  );
}
