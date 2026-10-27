import { describe, expect, it } from "vitest";
import { recolectarInstagram, resumir, usuarioDe } from "../lib/motor/recolector/instagram.js";

const post = (likes, comments, timestamp, media_type, caption = "post") => ({
  caption,
  like_count: likes,
  comments_count: comments,
  timestamp,
  media_type,
  permalink: "https://www.instagram.com/p/x/",
});
const BD = {
  username: "club",
  followers_count: 1000,
  media_count: 40,
  biography: "Move with us",
  media: {
    data: [
      post(100, 10, "2026-08-02T10:00:00+0000", "VIDEO", "Toti llega de Argentina"),
      post(40, 2, "2026-08-20T10:00:00+0000", "IMAGE"),
      post(20, 1, "2026-09-03T10:00:00+0000", "IMAGE"),
      post(8, 0, "2026-09-15T10:00:00+0000", "CAROUSEL_ALBUM", "Tu primera clase gratis"),
    ],
  },
};
const ENV = { META_IG_USER_ID: "178", META_ACCESS_TOKEN: "tok" };
const responde = (cuerpo) => {
  const llamadas = [];
  const f = async (u) => {
    llamadas.push(u);
    return { json: async () => cuerpo };
  };
  f.llamadas = llamadas;
  return f;
};
const respondeConOpts = (cuerpo) => {
  const llamadas = [];
  const f = async (u, opts) => {
    llamadas.push({ u, opts });
    return { json: async () => cuerpo };
  };
  f.llamadas = llamadas;
  return f;
};

describe("instagram", () => {
  it("usuarioDe saca el usuario del enlace", () => {
    expect(usuarioDe("https://www.instagram.com/boreal_slp/")).toBe("boreal_slp");
    expect(usuarioDe("instagram.com/boreal_slp?igsh=1")).toBe("boreal_slp");
    expect(usuarioDe("https://www.instagram.com/p/Ddryw9Kzen0/")).toBeNull();
    expect(usuarioDe(null)).toBeNull();
  });

  it("las cifras las calcula el código", () => {
    const r = resumir(BD);
    expect(r).toMatchObject({ usuario: "club", seguidores: 1000, analizadas: 4, promedio: 45, tasa: 4.5 });
    expect(r.top[0]).toMatchObject({ texto: "Toti llega de Argentina", interacciones: 110, tipo: "reel", fecha: "2026-08-02" });
    expect(r.porMes).toEqual([
      { mes: "2026-08", posts: 2, promedio: 76 },
      { mes: "2026-09", posts: 2, promedio: 15 },
    ]);
    expect(r.porTipo).toEqual(
      expect.arrayContaining([
        { tipo: "reel", posts: 1, promedio: 110 },
        { tipo: "foto", posts: 2, promedio: 32 },
        { tipo: "carrusel", posts: 1, promedio: 8 },
      ]),
    );
  });

  it("pide business_discovery con el usuario y el token", async () => {
    const f = responde({ business_discovery: BD, id: "178" });
    const r = await recolectarInstagram("https://www.instagram.com/club/", { fetch: f, env: ENV });
    expect(r.ok).toBe(true);
    expect(decodeURIComponent(f.llamadas[0])).toContain("business_discovery.username(club)");
    expect(f.llamadas[0]).toContain("access_token=tok");
  });

  it("sin configurar, cuenta personal o red caída son motivos", async () => {
    expect(await recolectarInstagram("https://www.instagram.com/club/", { fetch: responde({}), env: {} })).toEqual({
      ok: false,
      motivo: "Instagram sin configurar (faltan META_IG_USER_ID y META_ACCESS_TOKEN).",
    });
    const personal = await recolectarInstagram("https://www.instagram.com/club/", {
      fetch: responde({ error: { message: "Invalid user id", code: 110 } }),
      env: ENV,
    });
    expect(personal.motivo).toContain("Invalid user id");
    const caida = await recolectarInstagram("https://www.instagram.com/club/", {
      fetch: async () => {
        throw new Error("red");
      },
      env: ENV,
    });
    expect(caida).toMatchObject({ ok: false });
    expect(await recolectarInstagram(undefined, { env: ENV })).toEqual({ ok: false, motivo: "No dio su Instagram." });
  });

  it("likes ocultos no bajan el promedio", () => {
    const BDOcultos = {
      ...BD,
      media: {
        data: [
          ...BD.media.data,
          { caption: "sin likes", comments_count: 50, timestamp: "2026-09-20T10:00:00+0000", media_type: "IMAGE", permalink: "https://www.instagram.com/p/x/" },
        ],
      },
    };
    const r = resumir(BDOcultos);
    expect(r.likesOcultos).toBe(1);
    expect(r.analizadas).toBe(5);
    expect(r.promedio).toBe(45);
    expect(r.top[0].interacciones).toBe(110);
  });

  it("todos los likes ocultos: promedio y tasa son null", () => {
    const r = resumir({ ...BD, media: { data: BD.media.data.map(({ like_count, ...m }) => m) } });
    expect(r.likesOcultos).toBe(4);
    expect(r.promedio).toBeNull();
    expect(r.tasa).toBeNull();
  });

  it("pasa un timeout de 15 segundos a fetch", async () => {
    const f = respondeConOpts({ business_discovery: BD, id: "178" });
    const r = await recolectarInstagram("https://www.instagram.com/club/", { fetch: f, env: ENV });
    expect(r.ok).toBe(true);
    expect(f.llamadas[0].opts.signal).toBeDefined();
  });

  it("nunca expone el token en motivo", async () => {
    const personalWithError = await recolectarInstagram("https://www.instagram.com/club/", {
      fetch: responde({ error: { message: "Invalid user id", code: 110 } }),
      env: ENV,
    });
    expect(JSON.stringify(personalWithError)).not.toContain("tok");
    const redException = await recolectarInstagram("https://www.instagram.com/club/", {
      fetch: async () => {
        throw new Error("Network failed");
      },
      env: ENV,
    });
    expect(JSON.stringify(redException)).not.toContain("tok");
  });
});
