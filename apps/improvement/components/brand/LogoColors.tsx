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
    };
    img.src = url;
  }

  return (
    <>
      <label className="permiso-field">
        <span>Tu logo</span>
        <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="config-input" />
      </label>
      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por next/image */}
      {preview && <img src={preview} alt="Vista previa de tu logo" className="home-logo" />}
      {found && <p className="config-hint" role="status">Tomamos estos colores de tu logo; cámbialos si quieres.</p>}
      <label className="permiso-field">
        <span>Color principal</span>
        <input type="color" name="primaryColor" value={colors.primary} onChange={(e) => setColors({ ...colors, primary: e.target.value })} />
      </label>
      <label className="permiso-field">
        <span>Color secundario</span>
        <input type="color" name="secondaryColor" value={colors.secondary} onChange={(e) => setColors({ ...colors, secondary: e.target.value })} />
      </label>
    </>
  );
}
