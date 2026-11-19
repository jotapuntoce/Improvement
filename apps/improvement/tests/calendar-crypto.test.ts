// Cifrado de refresh tokens: ida y vuelta, IV aleatorio, manipulación y llave mala. Llave generada aquí.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/server/calendar/crypto.ts";

const KEY = randomBytes(32).toString("base64");
const PLAIN = "1//refresh-de-prueba";

function cifra(plain = PLAIN, k = KEY) {
  const r = encryptToken(plain, k);
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
}

describe("crypto de tokens", () => {
  it("WHEN se cifra y descifra con la misma llave THE SYSTEM SHALL devolver el texto original", () => {
    expect(decryptToken(cifra(), KEY)).toEqual({ ok: true, data: PLAIN });
  });

  it("WHEN se cifra dos veces THE SYSTEM SHALL dar resultados distintos que empiezan con v1.", () => {
    const a = cifra();
    const b = cifra();
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(b.startsWith("v1.")).toBe(true);
  });

  it("WHEN se altera el cifrado o se usa otra llave THE SYSTEM SHALL devolver BAD_TOKEN sin lanzar", () => {
    const blob = cifra();
    const last = blob.at(-1) === "A" ? "B" : "A";
    const alterado = blob.slice(0, -1) + last;
    expect(decryptToken(alterado, KEY)).toMatchObject({ ok: false, error: { code: "BAD_TOKEN" } });
    expect(decryptToken(blob, randomBytes(32).toString("base64"))).toMatchObject({ ok: false, error: { code: "BAD_TOKEN" } });
    expect(decryptToken("v2.a.b.c", KEY)).toMatchObject({ ok: false, error: { code: "BAD_TOKEN" } });
  });

  it("WHEN la llave decodifica a 16 bytes THE SYSTEM SHALL devolver BAD_KEY", () => {
    const corta = randomBytes(16).toString("base64");
    expect(encryptToken(PLAIN, corta)).toMatchObject({ ok: false, error: { code: "BAD_KEY" } });
    expect(decryptToken(cifra(), corta)).toMatchObject({ ok: false, error: { code: "BAD_KEY" } });
  });
});
