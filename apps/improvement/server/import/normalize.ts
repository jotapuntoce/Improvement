// apps/improvement/server/import/normalize.ts
// Una celda como la escribe un dueño en México ("$1,234.50", "31/12/2026", "Sí") → el valor que
// acepta schemaFor(). Lo que no reconoce lo deja tal cual para que schemaFor marque esa fila.
import type { FieldDef } from "../apps/fields.ts";

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function normalizeCell(field: FieldDef, raw: string): unknown {
  const v = raw.trim();
  if (v === "") return "";
  switch (field.type) {
    case "dinero":
    case "numero":
      return v.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
    case "fecha": {
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
      if (!m) return v;
      const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
      return `${year}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    }
    case "si_no":
      return ["si", "x", "1", "true", "verdadero"].includes(plain(v));
    case "opcion":
      return field.options.find((o) => plain(o) === plain(v)) ?? v;
    case "texto":
      return v;
  }
}
