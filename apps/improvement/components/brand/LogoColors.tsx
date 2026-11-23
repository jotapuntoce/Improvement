"use client";
// Al elegir el logo: lo muestra y pone sus dos colores principales en los selectores de color del
// mismo formulario. El dueño los puede cambiar antes de guardar.
import { useState } from "react";
import { dominantColors } from "./dominantColors.ts";

export function LogoColors({ primary, secondary }: { primary: string; secondary: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [colors, setColors] = useState({ primary, secondary });
  const [found, setFound] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const form = e.currentTarget.form;
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 64, 64);
      const [a, b] = dominantColors(ctx.getImageData(0, 0, 64, 64).data);
      if (!a) return;
      setColors({ primary: a, secondary: b ?? a });
      setFound(true);
      // Cambiar el value por estado no dispara "input": se avisa al formulario para que quien lo
      // escucha (la tarjeta del arranque) vea los colores nuevos, después de que React los pinte.
      requestAnimationFrame(() => form?.dispatchEvent(new Event("input", { bubbles: true })));
    };
    img.src = url;
  }

  return (
    <>
      <label className="arr-drop">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por next/image */}
        {preview ? <img src={preview} alt="Vista previa de tu logo" className="arr-drop-logo" /> : <span className="arr-drop-icon" aria-hidden="true">↑</span>}
        <span className="arr-drop-title">{preview ? "Cambiar logo" : "Elige tu logo"}</span>
        <span className="arr-drop-hint">PNG, JPG o WebP · tomamos sus colores</span>
        <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" onChange={onFile} aria-label="Tu logo" />
      </label>
      {found && <p className="arr-why" role="status">Tomé estos colores de tu logo; cámbialos si quieres.</p>}
      <div className="arr-swatches">
        <label className="arr-swatch">
          <input type="color" name="primaryColor" value={colors.primary} onChange={(e) => setColors({ ...colors, primary: e.target.value })} />
          <span>Color principal<br /><code>{colors.primary}</code></span>
        </label>
        <label className="arr-swatch">
          <input type="color" name="secondaryColor" value={colors.secondary} onChange={(e) => setColors({ ...colors, secondary: e.target.value })} />
          <span>Color secundario<br /><code>{colors.secondary}</code></span>
        </label>
      </div>
    </>
  );
}
