// Pruebas puras (sin base de datos) de la normalización y validación del borde de chequeos.
import { describe, expect, it } from "vitest";
import {
  normalizarCorreo,
  normalizarTelefono,
  negocioClave,
  registroSchema,
  propioSchema,
  entrevistaSchema,
  camposInvalidos,
  etapaDe,
  datosPropioSchema,
} from "../lib/chequeoDatos.js";

const registro = {
  tipo: "negocio",
  nombre: "Ana López",
  negocio: "Boreal",
  giro: "club de pádel",
  correo: "Ana@Ejemplo.com ",
  telefono: "+52 444 123 4567",
  ciudad: "San Luis Potosí",
  canal: "reel",
  aceptaAviso: true,
  aceptaCorreos: true,
};

describe("normalización", () => {
  it("correo en minúsculas y sin espacios", () => {
    expect(normalizarCorreo("  Ana@Ejemplo.COM ")).toBe("ana@ejemplo.com");
  });
  it("teléfono: mismos 10 dígitos con o sin código de país", () => {
    expect(normalizarTelefono("+52 444 123 4567")).toBe("4441234567");
    expect(normalizarTelefono("521 444 123 4567")).toBe("4441234567");
    expect(normalizarTelefono("(444) 123-4567")).toBe("4441234567");
  });
  it("negocioClave ignora mayúsculas y acentos; null para emprendedor", () => {
    expect(negocioClave({ tipo: "negocio", negocio: "BOREAL", ciudad: "San Luis Potosí" })).toBe(
      negocioClave({ tipo: "negocio", negocio: "boreal", ciudad: "san luis potosi" }),
    );
    expect(negocioClave({ tipo: "emprendedor", negocio: "Mi idea", ciudad: "SLP" })).toBeNull();
  });
});

describe("registroSchema", () => {
  it("acepta un registro completo y normaliza", () => {
    const r = registroSchema.parse(registro);
    expect(r.correo).toBe("ana@ejemplo.com");
    expect(r.telefono).toBe("4441234567");
  });
  it("exige aceptar el aviso y el giro", () => {
    const r = registroSchema.safeParse({ ...registro, aceptaAviso: false, giro: "" });
    expect(r.success).toBe(false);
    expect(Object.keys(camposInvalidos(r.error)).sort()).toEqual(["aceptaAviso", "giro"]);
  });
  it("negocio obligatorio solo para tipo negocio", () => {
    expect(registroSchema.safeParse({ ...registro, negocio: "" }).success).toBe(false);
    expect(registroSchema.safeParse({ ...registro, tipo: "emprendedor", negocio: "" }).success).toBe(true);
  });
  it("rechaza un canal que no existe", () => {
    expect(registroSchema.safeParse({ ...registro, canal: "radio" }).success).toBe(false);
    // "directo" (prospecto del dueño, sin comisión) solo lo usa el panel
    expect(registroSchema.safeParse({ ...registro, canal: "directo" }).success).toBe(false);
    expect(propioSchema.safeParse({ tipo: "negocio", negocio: "B", giro: "g", ciudad: "c", canal: "directo" }).success).toBe(true);
  });
});

describe("propioSchema", () => {
  it("correo y teléfono opcionales; vacíos quedan en null", () => {
    const r = propioSchema.parse({ tipo: "negocio", negocio: "Boreal", giro: "pádel", ciudad: "SLP", canal: "referido", correo: "", telefono: "" });
    expect(r.correo).toBeNull();
    expect(r.telefono).toBeNull();
  });
  it("si trae correo, lo valida", () => {
    expect(propioSchema.safeParse({ tipo: "negocio", negocio: "B", giro: "g", ciudad: "c", canal: "otro", correo: "x" }).success).toBe(false);
  });
});

describe("entrevistaSchema", () => {
  const base = {
    clave: "x".repeat(43),
    enlaces: {},
    sinRedes: false,
    respuestas: [1, 2, 3].map((n) => ({ pregunta: `P${n}`, respuesta: `R${n}` })),
  };
  it("exige un enlace o la casilla sin redes", () => {
    expect(entrevistaSchema.safeParse(base).success).toBe(false);
    expect(entrevistaSchema.safeParse({ ...base, sinRedes: true }).success).toBe(true);
    expect(entrevistaSchema.safeParse({ ...base, enlaces: { google: "https://g.co/x" } }).success).toBe(true);
  });
  it("exige exactamente 3 respuestas no vacías y las guarda como se escribieron", () => {
    const dos = { ...base, sinRedes: true, respuestas: base.respuestas.slice(0, 2) };
    expect(entrevistaSchema.safeParse(dos).success).toBe(false);
    const r = entrevistaSchema.parse({
      ...base,
      sinRedes: true,
      respuestas: [{ pregunta: "P", respuesta: "  hola K tal  " }, ...base.respuestas.slice(1)],
    });
    expect(r.respuestas[0].respuesta).toBe("hola K tal");
  });
  it("rechaza un enlace que no es URL", () => {
    expect(entrevistaSchema.safeParse({ ...base, enlaces: { instagram: "boreal" } }).success).toBe(false);
  });
});

describe("motor", () => {
  it("etapaDe distingue borrador, aprobado y PDF subido a mano", () => {
    expect(etapaDe({ etapa: "pedido", motorEstado: "borrador" })).toBe("Borrador listo");
    expect(etapaDe({ etapa: "pedido", motorEstado: "aprobado" })).toBe("Listo para entregar");
    expect(etapaDe({ etapa: "pedido", motorEstado: "sin_empezar", pdfPath: "x/1.pdf" })).toBe("Listo para entregar");
    expect(etapaDe({ etapa: "pedido", motorEstado: "armando" })).toBe("Pedido");
    expect(etapaDe({ etapa: "contacto", motorEstado: "aprobado" })).toBe("Contacto");
  });

  it("datosPropioSchema ignora enlaces vacíos y valida los llenos", () => {
    const r = datosPropioSchema.parse({ enlaces: { instagram: "", sitio: "https://borealslp.com" }, nota: "  " });
    expect(r).toEqual({ enlaces: { sitio: "https://borealslp.com" }, nota: null });
    expect(datosPropioSchema.safeParse({ enlaces: { sitio: "borealslp" } }).success).toBe(false);
  });
});
