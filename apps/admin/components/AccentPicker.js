"use client";

import { useEffect, useRef, useState } from "react";
import { ACCENT_PRESETS, getAccent, setAccent } from "@/lib/storage";

function applyAccent(preset) {
  const root = document.documentElement;
  root.style.setProperty("--accent-1", preset.c1);
  root.style.setProperty("--accent-2", preset.c2);
}

export default function AccentPicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(ACCENT_PRESETS[0]);
  const ref = useRef(null);

  useEffect(() => {
    const preset = getAccent();
    // Hidrata el estado desde localStorage al montar — no hay forma de leerlo durante el
    // render del servidor, así que este setState síncrono en el mount es intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent(preset);
    applyAccent(preset);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function choose(preset) {
    setCurrent(preset);
    applyAccent(preset);
    setAccent(preset.id);
    setOpen(false);
  }

  return (
    <div className="accent-picker" ref={ref}>
      <button
        type="button"
        className="accent-trigger"
        onClick={() => setOpen((o) => !o)}
        title="Color de acento del panel"
        aria-label="Elegir color de acento"
      >
        <span
          className="accent-swatch"
          style={{ background: `linear-gradient(135deg, ${current.c1}, ${current.c2})` }}
        />
      </button>
      {open && (
        <div className="accent-menu">
          {ACCENT_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={`accent-option ${current.id === preset.id ? "accent-option-active" : ""}`}
              onClick={() => choose(preset)}
            >
              <span
                className="accent-swatch"
                style={{ background: `linear-gradient(135deg, ${preset.c1}, ${preset.c2})` }}
              />
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
