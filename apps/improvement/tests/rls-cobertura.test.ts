// Que ninguna tabla se quede sin RLS otra vez.
//
// POR QUÉ ESTA PRUEBA EXISTE. `prospect_client` estuvo veinticuatro migraciones sin RLS. No fue una
// decisión: 0001_rls.sql blindó todo lo que existía ese día, la tabla nació en 0003, y nadie volvió
// a mirar. El arreglo de esa tabla es una línea de SQL; el arreglo del PROBLEMA es esto, porque el
// mismo olvido cabe en la tabla número 33 y nadie se va a enterar hasta que alguien audite.
//
// Es la segunda puerta de CLAUDE.md ("Dos puertas, no dos cerraduras"): el guard de la aplicación
// no cubre nada por el lado de PostgREST, así que una tabla sin política ahí no tiene NADA delante.
// Por eso la prueba es sobre la puerta, no sobre una tabla.
//
// Lee el SQL y no la base a propósito: corre en milisegundos, sin credenciales, y falla en el PR
// que agrega la tabla en vez de en una auditoría seis meses después.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..", "..", "packages", "db");
const ESQUEMA = join(RAIZ, "src", "schema.ts");
const MIGRACIONES = join(RAIZ, "migrations");

/** Los nombres de tabla tal como los declara `pgTable("…")`. */
function tablasDelEsquema(): string[] {
  const s = readFileSync(ESQUEMA, "utf8");
  return [...s.matchAll(/pgTable\(\s*\n?\s*"([a-z_]+)"/g)].map((m) => m[1]!);
}


function todoElSql(): string {
  return readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRACIONES, f), "utf8"))
    .join("\n")
    .toLowerCase();
}

describe("la segunda puerta: RLS", () => {
  it(
    "WHEN existe una tabla en el esquema THE SYSTEM SHALL tener su RLS habilitada en alguna " +
      "migración — sin eso, el rol `authenticated` la lee entera desde la consola del navegador",
    () => {
      const sql = todoElSql();
      const sinRls = tablasDelEsquema().filter(
        (t) => !sql.includes(`alter table ${t} enable row level security`) &&
          !sql.includes(`alter table "${t}" enable row level security`),
      );

      // El mensaje nombra las tablas: quien rompa esto tiene que saber CUÁL olvidó, no solo que
      // olvidó algo.
      expect(sinRls, `tablas sin RLS: ${sinRls.join(", ")}`).toEqual([]);
    },
  );

  it("la prueba lee tablas de verdad — si el regex dejara de encontrarlas, pasaría vacía y mentiría", () => {
    const tablas = tablasDelEsquema();
    expect(tablas.length).toBeGreaterThan(25);
    expect(tablas).toContain("improvement_cycle");
    expect(tablas).toContain("prospect_client");
  });
});
