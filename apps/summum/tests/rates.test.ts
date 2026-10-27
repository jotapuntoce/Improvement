import { describe, expect, it } from "vitest";
import { feeCents, pickRate, type RateRow } from "../server/fees/rates.ts";

const B = "barco-1";
const fabrica: RateRow = { barcoOrgId: null, chargeKind: "venta_propia", percentBps: 500, fixedCents: 0 };
const propia: RateRow = { barcoOrgId: B, chargeKind: "venta_propia", percentBps: 300, fixedCents: 200 };
const otroBarco: RateRow = { barcoOrgId: "barco-2", chargeKind: "venta_propia", percentBps: 900, fixedCents: 0 };

describe("pickRate", () => {
  it("WHEN hay personalizada del barco THE SYSTEM SHALL preferirla a la de fábrica", () => {
    expect(pickRate([fabrica, propia, otroBarco], B, "venta_propia")).toBe(propia);
  });
  it("WHEN no hay personalizada THE SYSTEM SHALL usar la de fábrica", () => {
    expect(pickRate([fabrica, otroBarco], B, "venta_propia")).toBe(fabrica);
  });
  it("WHEN no hay tasa para ese tipo THE SYSTEM SHALL devolver null, nunca 0 %", () => {
    expect(pickRate([fabrica, propia], B, "proyecto_summum")).toBeNull();
  });
});

describe("feeCents", () => {
  it("WHEN 25 % de 100.00 MXN THE SYSTEM SHALL dar 2500 centavos", () => {
    expect(feeCents(10_000, { percentBps: 2500, fixedCents: 0 })).toBe(2500);
  });
  it("WHEN porcentaje + fija THE SYSTEM SHALL sumarlas", () => {
    expect(feeCents(10_000, { percentBps: 300, fixedCents: 200 })).toBe(500);
  });
  it("WHEN el resultado tiene fracción de centavo THE SYSTEM SHALL redondear al centavo", () => {
    expect(feeCents(333, { percentBps: 2500, fixedCents: 0 })).toBe(83); // 83.25
    expect(feeCents(1, { percentBps: 5000, fixedCents: 0 })).toBe(1); // 0.5 → 1
  });
  it("WHEN la comisión excede el monto THE SYSTEM SHALL topar al monto", () => {
    expect(feeCents(100, { percentBps: 500, fixedCents: 1000 })).toBe(100);
  });
  it("WHEN el monto es enorme THE SYSTEM SHALL seguir exacto", () => {
    expect(feeCents(9_000_000_000_00, { percentBps: 2000, fixedCents: 0 })).toBe(1_800_000_000_00);
  });
  it("WHEN el monto no es entero positivo THE SYSTEM SHALL lanzar", () => {
    expect(() => feeCents(10.5, { percentBps: 100, fixedCents: 0 })).toThrow();
    expect(() => feeCents(0, { percentBps: 100, fixedCents: 0 })).toThrow();
  });
});
