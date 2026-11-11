// Datos de la tarjeta "Tu Improvement, armándose". Módulo sin "use client" a propósito: las páginas
// (Server Components) importan ARMADO_VACIO y un export de un archivo "use client" les llegaría como
// referencia de cliente, no como valor.

export const ARRANQUE_FORM = "arranque-form";

export interface ArmadoData {
  ownerName: string | null;
  name: string | null;
  industry: string | null;
  city: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  /** Apps propias del negocio; las base siempre están. */
  apps: string[];
}

export const ARMADO_VACIO: ArmadoData = {
  ownerName: null, name: null, industry: null, city: null, logoUrl: null, primaryColor: null, secondaryColor: null, apps: [],
};

/** Lo que el formulario dice hoy, encima de lo guardado. Solo pisa los campos que el formulario trae;
 *  un campo vacío = el dueño todavía no lo contesta. */
export function leerFormulario(form: HTMLFormElement, base: ArmadoData): ArmadoData {
  const f = new FormData(form);
  const has = (k: string) => form.elements.namedItem(k) !== null;
  const text = (k: string) => f.get(k)?.toString().trim() || null;
  const d = { ...base };
  if (has("fullName")) d.ownerName = text("fullName");
  if (has("name")) d.name = text("name");
  if (has("industry")) d.industry = text("industry");
  if (has("city")) d.city = text("city");
  if (has("primaryColor")) d.primaryColor = text("primaryColor");
  if (has("secondaryColor")) d.secondaryColor = text("secondaryColor");
  if (has("pick")) {
    d.apps = f.getAll("pick").map((i) => text(`name-${i.toString()}`)).filter((n): n is string => n !== null);
  }
  return d;
}
