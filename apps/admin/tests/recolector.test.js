import { describe, expect, it } from "vitest";
import { recolectar } from "../lib/motor/recolector/index.js";

const C = { enlaces: { sitio: "https://a.test", instagram: "https://instagram.com/a" } };
const OK = (x) => ({ ok: true, data: x });
const hoy = () => new Date().toISOString();
const previoBase = () => ({
  fecha: hoy(),
  enlaces: { sitio: "https://a.test", instagram: "https://instagram.com/a" },
  sitio: OK("viejo-sitio"),
  instagram: OK("viejo-ig"),
});
const fakes = () => {
  const llamadas = [];
  return {
    llamadas,
    sitio: async () => (llamadas.push("sitio"), OK("nuevo-sitio")),
    instagram: async () => (llamadas.push("instagram"), OK("nuevo-ig")),
  };
};

describe("recolectar con expediente previo", () => {
  it("pieza ok con el mismo enlace y reciente: se reusa", async () => {
    const f = fakes();
    const r = await recolectar(C, { previo: previoBase(), ...f });
    expect(f.llamadas).toEqual([]);
    expect(r.sitio.data).toBe("viejo-sitio");
    expect(r.enlaces).toEqual(C.enlaces);
  });

  it("pieza fallida: se junta otra vez", async () => {
    const f = fakes();
    const r = await recolectar(C, { previo: { ...previoBase(), instagram: { ok: false, motivo: "x" } }, ...f });
    expect(f.llamadas).toEqual(["instagram"]);
    expect(r.instagram.data).toBe("nuevo-ig");
    expect(r.sitio.data).toBe("viejo-sitio");
  });

  it("enlace cambiado: se junta otra vez", async () => {
    const f = fakes();
    await recolectar({ enlaces: { ...C.enlaces, sitio: "https://b.test" } }, { previo: previoBase(), ...f });
    expect(f.llamadas).toEqual(["sitio"]);
  });

  it("expediente de más de 7 días: todo se junta otra vez", async () => {
    const f = fakes();
    const viejo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await recolectar(C, { previo: { ...previoBase(), fecha: viejo }, ...f });
    expect(f.llamadas.sort()).toEqual(["instagram", "sitio"]);
  });

  it("google busca por negocio y ciudad, y se reusa si no cambian", async () => {
    const llamadas = [];
    const google = async (q) => (llamadas.push(q), OK("g"));
    const c = { tipo: "negocio", negocio: "Boreal", ciudad: "SLP", enlaces: C.enlaces };
    const r = await recolectar(c, { ...fakes(), google });
    expect(llamadas).toEqual(["Boreal, SLP"]);
    expect(r.enlaces.google).toBe("Boreal, SLP");
    await recolectar(c, { previo: r, ...fakes(), google });
    expect(llamadas).toHaveLength(1);
    await recolectar({ ...c, ciudad: "CDMX" }, { previo: r, ...fakes(), google });
    expect(llamadas).toEqual(["Boreal, SLP", "Boreal, CDMX"]);
  });
});
