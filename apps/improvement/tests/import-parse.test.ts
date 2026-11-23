// Leer lo que el dueño ya tiene: CSV propio, Excel con read-excel-file y celdas en formato mexicano.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../server/import/csv.ts";
import { normalizeCell } from "../server/import/normalize.ts";
import { MAX_BYTES, MAX_ROWS, readTable } from "../server/import/parse.ts";
import type { FieldDef, FieldType } from "../server/apps/fields.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const csv = (s: string, name = "c.csv") => ({ name, type: "text/csv", bytes: enc(s) });
const f = (type: FieldType, options: string[] = []): FieldDef => ({ key: "k", label: "K", type, options, required: false });

describe("leer archivos", () => {
  it("WHEN el CSV trae comillas, comas y saltos dentro de una celda THE SYSTEM SHALL respetarlos", () => {
    expect(parseCsv('﻿Nombre,Nota\r\n"Pérez, Ana","dijo ""hola""\nmañana"\r\n\r\n')).toEqual([
      ["Nombre", "Nota"],
      ["Pérez, Ana", 'dijo "hola"\nmañana'],
    ]);
  });

  it("WHEN el CSV usa punto y coma (Excel en español) THE SYSTEM SHALL detectarlo", () => {
    expect(parseCsv("a;b\n1,5;2")).toEqual([["a", "b"], ["1,5", "2"]]);
  });

  it("WHEN la celda viene en formato mexicano THE SYSTEM SHALL dejarla lista para schemaFor", () => {
    expect(normalizeCell(f("dinero"), "$1,234.50")).toBe("1234.50");
    expect(normalizeCell(f("numero"), " 1,200 ")).toBe("1200");
    expect(normalizeCell(f("fecha"), "31/12/2026")).toBe("2026-12-31");
    expect(normalizeCell(f("fecha"), "5/1/26")).toBe("2026-01-05");
    expect(normalizeCell(f("fecha"), "2026-12-31")).toBe("2026-12-31");
    expect(normalizeCell(f("fecha"), "mañana")).toBe("mañana");
    expect(normalizeCell(f("si_no"), "Sí")).toBe(true);
    expect(normalizeCell(f("si_no"), "no")).toBe(false);
    expect(normalizeCell(f("texto"), "  hola ")).toBe("hola");
    expect(normalizeCell(f("opcion", ["Mayoreo", "Menudeo"]), "mayoreo")).toBe("Mayoreo");
    expect(normalizeCell(f("texto"), "   ")).toBe("");
  });

  it("WHEN se sube un CSV THE SYSTEM SHALL separar encabezados y nombrar los vacíos", async () => {
    expect(await readTable(csv("Nombre,,Tel\nAna,x,555\nLuis"))).toEqual({
      ok: true,
      data: { source: "csv", headers: ["Nombre", "Columna 2", "Tel"], rows: [["Ana", "x", "555"], ["Luis", "", ""]] },
    });
  });

  it("WHEN el archivo pasa de 5 MB, de 5,000 filas o no trae filas THE SYSTEM SHALL rechazarlo con su motivo", async () => {
    const big = await readTable({ name: "a.csv", type: "text/csv", bytes: new Uint8Array(MAX_BYTES + 1) });
    expect(big.ok || big.error.message).toMatch(/5 MB/);
    const many = await readTable(csv("n\n" + "x\n".repeat(MAX_ROWS + 1)));
    expect(many.ok || many.error.message).toMatch(/5,000/);
    const empty = await readTable(csv("Nombre\n"));
    expect(empty.ok || empty.error.message).toMatch(/no trae filas/);
  });

  it("WHEN se sube un .xlsx THE SYSTEM SHALL leer su primera hoja como texto, con fechas ISO", async () => {
    const bytes = new Uint8Array(readFileSync(new URL("./fixtures/clientes.xlsx", import.meta.url)));
    expect(await readTable({ name: "clientes.xlsx", type: "", bytes })).toEqual({
      ok: true,
      data: { source: "xlsx", headers: ["Nombre", "Alta"], rows: [["Ana", "2026-12-31"], ["Luis", "12"]] },
    });
  });

  it("WHEN se sube un PDF o una foto THE SYSTEM SHALL pedir lectura con IA, y otro tipo lo rechaza", async () => {
    expect(await readTable({ name: "a.pdf", type: "application/pdf", bytes: new Uint8Array(10) })).toMatchObject({ ok: false, error: { code: "NEEDS_AI" } });
    expect(await readTable({ name: "a.jpg", type: "image/jpeg", bytes: new Uint8Array(10) })).toMatchObject({ ok: false, error: { code: "NEEDS_AI" } });
    expect(await readTable({ name: "a.zip", type: "application/zip", bytes: new Uint8Array(10) })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});
