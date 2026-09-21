// Qué colores tiene el edificio de cada cliente.
//
// Antes todos los edificios eran el mismo: dorado sobre azul noche, porque `--building-accent` era
// lo único que una organización podía cambiar y ninguna lo tenía puesto. Dos clientes distintos
// entraban a su empresa y veían exactamente la misma fachada.
//
// La paleta se elige por GIRO — un dato de la fila, nunca el nombre de la empresa (motor genérico,
// Non-negotiable #2 de CLAUDE.md). Una organización con `accent_color` propio sobreescribe solo el
// acento: el giro sigue mandando en la fachada, y el cliente que eligió su color lo ve donde más se
// nota (rótulo, marco, puertas, marquesina).
//
// Los hex viven en packages/ui/src/tokens.css, no aquí — esto solo dice qué token le toca a quién.
import { isIndustry, type Industry } from "./industries.ts";

export interface BuildingPalette {
  /** Rótulo, marco de la fachada, puertas, marquesina, circuito de áreas. */
  accent: string;
  /** Parte alta de la fachada (el gradiente va de aquí a `facade2`). */
  facade: string;
  /** Parte baja de la fachada, y el material de puertas y letrero. */
  facade2: string;
  /** El brillo del nombre de la empresa en el rótulo. */
  signGlow: string;
}

function tokens(giro: Industry | "construccion"): BuildingPalette {
  return {
    accent: `var(--pal-${giro}-accent)`,
    facade: `var(--pal-${giro}-facade)`,
    facade2: `var(--pal-${giro}-facade-2)`,
    signGlow: `var(--pal-${giro}-glow)`,
  };
}

/** "otro" (y cualquier giro desconocido o nulo) usa la fachada dorada con la que nació la escena. */
const PALETTES: Record<Industry, BuildingPalette> = {
  restaurante: tokens("restaurante"),
  retail: tokens("retail"),
  servicios: tokens("servicios"),
  salud: tokens("salud"),
  construccion: tokens("construccion"),
  tecnologia: tokens("tecnologia"),
  manufactura: tokens("manufactura"),
  otro: tokens("construccion"),
};

export function buildingPalette(
  industry: string | null | undefined,
  accentColor?: string | null,
): BuildingPalette {
  const base = PALETTES[isIndustry(industry) ? industry : "otro"];
  return accentColor ? { ...base, accent: accentColor } : base;
}

/**
 * La paleta como custom properties, para el wrapper `.jpc-scene`.
 *
 * Se aplica UNA vez en el contenedor: ni Building.tsx ni Reception.tsx reciben colores como props —
 * los dos ya leen estos mismos tokens, así que heredan por CSS y no pueden desincronizarse.
 *
 * `--bg-window-off` se deriva de la fachada en vez de ser un token por giro: una ventana apagada es
 * el mismo muro un poco más oscuro, y con el azul fijo de antes se veía azul sobre una fachada
 * terracota.
 */
export function paletteStyle(p: BuildingPalette): Record<string, string> {
  return {
    "--building-accent": p.accent,
    "--bg-facade": p.facade,
    "--bg-facade-2": p.facade2,
    "--sign-glow": p.signGlow,
    "--bg-window-off": `color-mix(in srgb, ${p.facade2} 80%, black)`,
  };
}
