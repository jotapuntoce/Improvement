// apps/improvement/server/import/parse.ts
// Un archivo subido → su tabla { headers, rows } en texto. CSV con el lector propio y .xlsx con
// read-excel-file (primera hoja). PDF y fotos no se leen aquí: devuelven NEEDS_AI y jobs.ts los manda
// al gateway. Sin guard: solo lo llama jobs.ts, que ya autorizó al dueño.
import { readSheet } from "read-excel-file/node";
import { parseCsv } from "./csv.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): Result<never> => ({ ok: false, error: { code, message } });

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
export const MAX_COLS = 60;

export interface Table { headers: string[]; rows: string[][] }
export interface UploadedFile { name: string; type: string; bytes: Uint8Array }

export type FileKind = "csv" | "xlsx" | "pdf" | "imagen";
export function fileKind(file: { name: string; type: string }): FileKind | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || file.type === "text/csv") return "csv";
  if (ext === "xlsx" || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(ext) || /^image\/(png|jpeg|webp)$/.test(file.type)) return "imagen";
  return null;
}

const cellText = (c: unknown): string =>
  c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim();

/** Primera fila = encabezados (los vacíos se llaman "Columna N"); cada fila con el mismo ancho. Revisa los límites. */
export function toTable(grid: unknown[][]): Result<Table> {
  const [head, ...body] = grid.map((r) => r.map(cellText));
  const rows = body.filter((r) => r.some((c) => c !== ""));
  if (!head || rows.length === 0) return fail("El archivo no trae filas debajo de los encabezados.");
  if (rows.length > MAX_ROWS) return fail("El archivo pasa de 5,000 filas; divídelo en partes.");
  const width = Math.max(head.length, ...rows.map((r) => r.length));
  if (width > MAX_COLS) return fail("El archivo pasa de 60 columnas.");
  const headers = Array.from({ length: width }, (_, i) => head[i] || `Columna ${i + 1}`);
  return { ok: true, data: { headers, rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")) } };
}

export async function readTable(file: UploadedFile): Promise<Result<Table & { source: "csv" | "xlsx" }>> {
  if (file.bytes.byteLength > MAX_BYTES) return fail("El archivo pasa de 5 MB.");
  const kind = fileKind(file);
  if (kind === "pdf" || kind === "imagen") return fail("Este archivo se lee con IA.", "NEEDS_AI");
  if (!kind) return fail("Sube un CSV, Excel (.xlsx), PDF o foto.");
  let grid: unknown[][];
  try {
    grid = kind === "csv" ? parseCsv(new TextDecoder().decode(file.bytes)) : await readSheet(Buffer.from(file.bytes));
  } catch {
    return fail("No pudimos leer el archivo; revisa que no esté dañado o protegido.");
  }
  const t = toTable(grid);
  return t.ok ? { ok: true, data: { source: kind, ...t.data } } : t;
}
