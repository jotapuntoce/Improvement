// Tema por org (organization.theme): cuatro colores que sobrescriben los tokens base de tokens.css
// solo si pasan AA (≥ 4.5:1 contra `bg`). Módulo puro, sin React ni dependencias — la validación de
// forma (zod) vive en apps/improvement/server/companies/theme.ts. Ver blueprint oficinas-digitales §7.

export interface OrgTheme {
  bg: string;
  textPrimary: string;
  accent1: string;
  accent2: string;
}

export interface ThemeIssue {
  field: "textPrimary" | "accent1" | "accent2";
  ratio: number;
}

const AA = 4.5;

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG 2.x entre dos hex `#rrggbb` (sin redondear). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `[]` si los tres colores pasan AA contra `bg`; si no, uno por campo que falla (ratio a 2 decimales). */
export function themeIssues(theme: OrgTheme): ThemeIssue[] {
  const fields = ["textPrimary", "accent1", "accent2"] as const;
  return fields
    .map((field) => ({ field, ratio: Math.round(contrastRatio(theme[field], theme.bg) * 100) / 100 }))
    .filter((issue) => contrastRatio(theme[issue.field], theme.bg) < AA);
}

/** Las CSS vars que el layout de `app/[org]` pone en su `<div>` envolvente. */
export function themeStyle(theme: OrgTheme): Record<string, string> {
  return {
    "--bg": theme.bg,
    "--text-primary": theme.textPrimary,
    "--accent-1": theme.accent1,
    "--accent-2": theme.accent2,
  };
}
