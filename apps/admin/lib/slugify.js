// Compartido por app/prospects/actions.js y app/company-requests/actions.js — mismo criterio de
// unicidad de slug para cualquier organization nueva, sin importar de qué flujo viene. No puede
// vivir en un archivo "use server" (Next.js exige que todo export de ahí sea una función async).
export function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
