"use client";

// Visible en /empresas para CUALQUIER usuario (cliente o platform admin) — cada quien personaliza
// solo su propio ícono. Llama a updateAvatarColor (Task 7), que siempre resuelve el userId desde la
// sesión real, nunca desde un parámetro que este componente pudiera manipular.
import { useState, useTransition } from "react";
import { updateAvatarColor } from "@/server/profile/updateAvatarColor.ts";
import type { AvatarColorPreset } from "@jotapuntoce/ui/building/AvatarIcon.tsx";

const PRESETS: { id: AvatarColorPreset; label: string }[] = [
  { id: "aurora", label: "Aurora" },
  { id: "esmeralda", label: "Esmeralda" },
  { id: "solar", label: "Solar" },
  { id: "indigo", label: "Índigo" },
];

export function PersonalizeAvatar() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function choose(presetId: AvatarColorPreset) {
    startTransition(async () => {
      const result = await updateAvatarColor(presetId);
      if (result.ok) {
        setSaved(true);
        setOpen(false);
      }
    });
  }

  return (
    <div className="personalize-avatar">
      <button type="button" className="personalize-avatar-trigger" onClick={() => setOpen((o) => !o)}>
        Personalizar mi ícono
      </button>
      {open && (
        <div className="personalize-avatar-menu">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="personalize-avatar-option"
              disabled={isPending}
              onClick={() => choose(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {saved && <p className="personalize-avatar-saved">Guardado.</p>}
    </div>
  );
}
