# Chequeo como el primero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el motor arme cada Chequeo al nivel del primero de Boreal: con evidencia real (sitio recorrido en
Chromium e Instagram por la API de Meta), el primer Chequeo como ejemplo de forma y el molde de 6 páginas del
original.

**Architecture:** Un recolector de código (`lib/motor/recolector/`) junta la evidencia en un `expediente` que se
guarda en `chequeo.expediente` y viaja en el mensaje a la IA. El esquema y la plantilla cambian juntos al molde del
original (línea guía con frase a mano, "Lo que vimos" / "Por qué importa", "Para dimensionar", preguntas). La
página 2 deja de ser de la IA: es el texto fijo del dueño, conjugado por `trato`.

**Tech Stack:** Next.js 16 (JS), Drizzle/Postgres, zod 4, playwright-core 1.62.1 (ya instalado), Graph API de Meta
(Business Discovery) por `fetch`, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-05-chequeo-como-el-primero-design.md` (extiende
`2026-10-05-motor-chequeo-design.md`).

## Global Constraints

- Gate: `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar una tarea por hecha.
- Imports relativos con extensión explícita. `@/` solo en `app/**`.
- Nunca editar a mano una migración: `schema.ts` → `pnpm db:generate` → `pnpm db:migrate`.
- Sin dependencias nuevas: Chromium es `playwright-core` (ya está) y Meta se llama con `fetch` de Node.
- Las pruebas nunca salen a internet ni llaman a Anthropic o Meta: el sitio se sirve con `context.route`, Meta con un
  `fetch` inyectado.
- Ningún `.env*` se lee ni se edita; `META_IG_USER_ID` y `META_ACCESS_TOKEN` los pone el dueño.
- Plantilla: solo tokens de `packages/ui/src/tokens.css` (`--brand-navy`, `--brand-ivory`, `--brand-amber`,
  `--brand-amber-paper`, `--brand-thread`, `--dept-imaginacion`); ningún hex nuevo.
- Venta pull; sin cifras inventadas: toda cifra del Chequeo es `dato` (vista, con fuente) o `estimacion` (con su
  supuesto).
- La portada aprobada (`e42bd81`) no cambia.
- Errores como resultados tipados; `armarChequeo` nunca lanza.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `apps/admin/lib/motor/recolector/sitio.js` | recorre el sitio en Chromium: páginas, precios, pendientes, enlaces rotos, celular |
| `apps/admin/lib/motor/recolector/instagram.js` | Business Discovery de Meta y las cifras calculadas |
| `apps/admin/lib/motor/recolector/index.js` | `recolectar(c)` → expediente |
| `apps/admin/lib/motor/esquema.js` | esquema v2 (molde del original) |
| `apps/admin/lib/motor/muestra.js` | muestras v2 |
| `apps/admin/lib/motor/plantilla.js` | 6 páginas como el original; página 2 fija |
| `apps/admin/lib/motor/ejemplo-boreal.js` | el texto del primer Chequeo, como ejemplo de forma |
| `apps/admin/lib/motor/metodo.js` | método v2 (`2026-10-05.2`) y `mensajeDe` con expediente |
| `apps/admin/lib/motor/armar.js` | recolecta, guarda y reusa el expediente |
| `packages/db/src/schema.ts` | columna `chequeo.expediente` |

---

### Task 1: Recolector del sitio

**Files:**
- Create: `apps/admin/lib/motor/recolector/sitio.js`
- Test: `apps/admin/tests/recolector-sitio.test.js`

**Interfaces:**
- Produces: `recolectarSitio(url, { alPrepararContexto }?) → Promise<{ ok: true, data: { url, paginas: [{ url,
  titulo, status, texto, precios: string[], pendientes: string[] }], enlacesRotos: [{ texto, href, status }],
  regresanAlInicio: [{ texto, href }], celular: { seSaleDeLado, anchoPagina, anchoPantalla } } } | { ok: false,
  motivo }>`. `alPrepararContexto(ctx)` se llama con cada contexto de navegador antes de navegar (las pruebas lo usan
  para servir el sitio con `ctx.route`). Nunca lanza.

- [ ] **Step 1: Write the failing test** `apps/admin/tests/recolector-sitio.test.js`:

```js
import { describe, expect, it } from "vitest";
import { recolectarSitio } from "../lib/motor/recolector/sitio.js";

// Un sitio de mentira servido por Chromium mismo: nunca sale a internet.
const PAGINAS = {
  "/": `<html><body><nav><a href="/precios">Precios</a><a href="/torneos">Torneos</a><a href="/roto">Clínicas</a><a href="/">Instagram</a><a href="/">Inicio</a></nav><h1>Club de prueba</h1><div style="width:900px">ancho fijo</div></body></html>`,
  "/precios": `<html><head><title>Precios</title></head><body>Cancha $400 por hora y media. Clase $200.</body></html>`,
  "/torneos": `<html><body>Muy pronto, en este feed encontrarás cada torneo.</body></html>`,
};
const servir = (ctx) =>
  ctx.route("https://prueba.test/**", (route) => {
    const ruta = new URL(route.request().url()).pathname;
    const html = PAGINAS[ruta];
    return html ? route.fulfill({ status: 200, contentType: "text/html", body: html }) : route.fulfill({ status: 404, body: "no" });
  });

describe("recolectarSitio", () => {
  it("encuentra precios, pendientes, enlaces rotos, enlaces que regresan al inicio y el desborde en celular", async () => {
    const r = await recolectarSitio("https://prueba.test/", { alPrepararContexto: servir });
    expect(r.ok).toBe(true);
    const precios = r.data.paginas.find((p) => p.url.endsWith("/precios"));
    expect(precios.precios).toEqual(["$400", "$200"]);
    expect(r.data.paginas.find((p) => p.url.endsWith("/torneos")).pendientes).toEqual(["Muy pronto"]);
    expect(r.data.enlacesRotos).toEqual([{ texto: "Clínicas", href: "https://prueba.test/roto", status: 404 }]);
    expect(r.data.regresanAlInicio).toEqual([{ texto: "Instagram", href: "https://prueba.test/" }]);
    expect(r.data.celular.seSaleDeLado).toBe(true);
  }, 60_000);

  it("un sitio que no abre es un motivo, no una excepción", async () => {
    const r = await recolectarSitio("https://prueba.test/nada", { alPrepararContexto: servir });
    expect(r).toEqual({ ok: false, motivo: "El sitio respondió 404." });
  }, 60_000);
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/recolector-sitio.test.js`
  → FAIL (no existe el módulo).

- [ ] **Step 3: `apps/admin/lib/motor/recolector/sitio.js`**

```js
// Recolector del sitio: lo recorre como un cliente en Chromium (el mismo del PDF). Sin IA: lo que se puede medir se
// mide. Spec 2026-10-05-chequeo-como-el-primero-design.md, sección 3.
import { chromium } from "playwright-core";

const PENDIENTES =
  /muy pronto|pr[oó]ximamente|en construcci[oó]n|pregunta en recepci[oó]n|ac[eé]rcate (?:directamente )?a recepci[oó]n|coming soon/gi;
const PRECIO = /\$\s?\d[\d,]*(?:\.\d+)?/g;
const MAX_PAGINAS = 12;
const TEXTO_MAX = 2500;
const PLAZO_MS = 60_000;
// Textos de enlace que sí deben llevar al inicio (el logo no tiene texto).
const VAN_AL_INICIO = /^(inicio|home|)$/i;

const limpia = (u) => {
  const x = new URL(u);
  x.hash = "";
  x.search = "";
  return x.href.replace(/\/$/, "");
};
const unicos = (xs) => [...new Set(xs)];

export async function recolectarSitio(url, { alPrepararContexto } = {}) {
  let navegador;
  try {
    navegador = await chromium.launch();
    const plazo = Date.now() + PLAZO_MS;
    const ctx = await navegador.newContext();
    await alPrepararContexto?.(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15_000);

    const r = await page.goto(url, { waitUntil: "load" });
    if (!r || !r.ok()) return { ok: false, motivo: `El sitio respondió ${r?.status() ?? "sin respuesta"}.` };
    const inicio = limpia(page.url());
    const origen = new URL(inicio).origin;

    const enlaces = (
      await page.$$eval("a[href]", (as) =>
        as.map((a) => ({ texto: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 40), href: a.href })),
      )
    ).filter((a) => a.href.startsWith("http"));

    const regresanAlInicio = enlaces
      .filter((a) => limpia(a.href) === inicio && !VAN_AL_INICIO.test(a.texto))
      .map((a) => ({ texto: a.texto, href: a.href }));

    const internas = unicos(enlaces.map((a) => limpia(a.href)).filter((h) => h.startsWith(origen) && h !== inicio)).slice(0, MAX_PAGINAS);
    const paginas = [];
    const enlacesRotos = [];
    for (const destino of [inicio, ...internas]) {
      if (Date.now() > plazo) break; // ponytail: plazo total fijo; sitios lentos quedan a medias, sin fallar
      const resp = await page.goto(destino, { waitUntil: "load" }).catch(() => null);
      const status = resp?.status() ?? 0;
      if (!resp || status >= 400) {
        const a = enlaces.find((x) => limpia(x.href) === destino);
        enlacesRotos.push({ texto: a?.texto ?? "", href: a?.href ?? destino, status });
        continue;
      }
      const texto = (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").trim();
      paginas.push({
        url: destino,
        titulo: await page.title(),
        status,
        texto: texto.slice(0, TEXTO_MAX),
        precios: unicos(texto.match(PRECIO) ?? []).map((p) => p.replace(/\s/g, "")),
        pendientes: unicos(texto.match(PENDIENTES) ?? []),
      });
    }

    const movil = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await alPrepararContexto?.(movil);
    const pm = await movil.newPage();
    await pm.goto(inicio, { waitUntil: "load" }).catch(() => null);
    const celular = await pm
      .evaluate(() => ({ anchoPagina: document.documentElement.scrollWidth, anchoPantalla: window.innerWidth }))
      .catch(() => ({ anchoPagina: 0, anchoPantalla: 0 }));

    return {
      ok: true,
      data: { url: inicio, paginas, enlacesRotos, regresanAlInicio, celular: { ...celular, seSaleDeLado: celular.anchoPagina > celular.anchoPantalla + 2 } },
    };
  } catch (e) {
    return { ok: false, motivo: `No se pudo recorrer el sitio: ${e?.message ?? e}` };
  } finally {
    await navegador?.close().catch(() => {});
  }
}
```

- [ ] **Step 4: Run** — mismo comando → PASS (2). Si `precios` sale con otro orden, es el orden del texto: ajusta el
  test al orden en que aparecen en la página, no el código.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/motor/recolector/sitio.js apps/admin/tests/recolector-sitio.test.js
git commit -m "feat(admin): recolector del sitio para el Chequeo (enlaces, precios, pendientes, celular)"
```

---

### Task 2: Recolector de Instagram (Business Discovery)

**Files:**
- Create: `apps/admin/lib/motor/recolector/instagram.js`
- Test: `apps/admin/tests/recolector-instagram.test.js`

**Interfaces:**
- Produces: `usuarioDe(url) → string | null`; `resumir(bd) → { usuario, seguidores, publicaciones, bio, analizadas,
  promedio, tasa, top: Post[], porMes: [{ mes, posts, promedio }], porTipo: [{ tipo, posts, promedio }] }` con
  `Post = { texto, fecha, tipo, likes, comentarios, interacciones, url }`;
  `recolectarInstagram(url, { fetch, env }?) → Promise<{ ok: true, data: resumen } | { ok: false, motivo }>`. Nunca
  lanza.

- [ ] **Step 1: Write the failing test** `apps/admin/tests/recolector-instagram.test.js`:

```js
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
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/recolector-instagram.test.js`
  → FAIL.

- [ ] **Step 3: `apps/admin/lib/motor/recolector/instagram.js`**

```js
// Instagram por la API oficial de Meta (Business Discovery): las publicaciones públicas de una cuenta de negocio o
// creador, leídas con la cuenta de negocio de JotaPuntoCe. Las cifras las calcula el código; la IA solo las lee.
// Spec 2026-10-05-chequeo-como-el-primero-design.md, sección 3. Sin token, devuelve motivo y el motor sigue.
const TIPO = { IMAGE: "foto", VIDEO: "reel", CAROUSEL_ALBUM: "carrusel" };
const NO_SON_USUARIOS = ["p", "reel", "reels", "stories", "explore", "tv"];

export function usuarioDe(url) {
  const m = String(url ?? "").match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  return m && !NO_SON_USUARIOS.includes(m[1].toLowerCase()) ? m[1] : null;
}

const promedio = (xs) => (xs.length ? Math.round(xs.reduce((s, p) => s + p.interacciones, 0) / xs.length) : 0);
const agrupar = (posts, clave, nombre) =>
  Object.entries(Object.groupBy(posts, clave))
    .map(([k, xs]) => ({ [nombre]: k, posts: xs.length, promedio: promedio(xs) }))
    .sort((a, b) => String(a[nombre]).localeCompare(String(b[nombre])));

export function resumir(bd) {
  const posts = (bd.media?.data ?? []).map((m) => {
    const likes = m.like_count ?? 0;
    const comentarios = m.comments_count ?? 0;
    return {
      texto: (m.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
      fecha: String(m.timestamp ?? "").slice(0, 10),
      tipo: TIPO[m.media_type] ?? String(m.media_type ?? "").toLowerCase(),
      likes,
      comentarios,
      interacciones: likes + comentarios,
      url: m.permalink,
    };
  });
  const prom = promedio(posts);
  const seguidores = bd.followers_count ?? null;
  return {
    usuario: bd.username,
    seguidores,
    publicaciones: bd.media_count ?? null,
    bio: bd.biography ?? "",
    analizadas: posts.length,
    promedio: prom,
    tasa: seguidores ? Math.round((prom / seguidores) * 1000) / 10 : null, // % de seguidores que reacciona por post
    top: [...posts].sort((a, b) => b.interacciones - a.interacciones).slice(0, 6),
    porMes: agrupar(posts, (p) => p.fecha.slice(0, 7), "mes"),
    porTipo: agrupar(posts, (p) => p.tipo, "tipo"),
  };
}

export async function recolectarInstagram(url, { fetch: f = fetch, env = process.env } = {}) {
  const usuario = usuarioDe(url);
  if (!usuario) return { ok: false, motivo: "No dio su Instagram." };
  if (!env.META_IG_USER_ID || !env.META_ACCESS_TOKEN) {
    return { ok: false, motivo: "Instagram sin configurar (faltan META_IG_USER_ID y META_ACCESS_TOKEN)." };
  }
  const campos = `business_discovery.username(${usuario}){username,followers_count,media_count,biography,media.limit(50){caption,like_count,comments_count,timestamp,media_type,permalink}}`;
  const u = `https://graph.facebook.com/${env.META_IG_USER_ID}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;
  try {
    const cuerpo = await (await f(u)).json();
    if (cuerpo.error) return { ok: false, motivo: `Meta respondió: ${cuerpo.error.message} (¿cuenta personal o privada?).` };
    if (!cuerpo.business_discovery) return { ok: false, motivo: "Meta no devolvió la cuenta." };
    return { ok: true, data: resumir(cuerpo.business_discovery) };
  } catch (e) {
    return { ok: false, motivo: `No se pudo llamar a Meta: ${e?.message ?? e}` };
  }
}
```

- [ ] **Step 4: Run** — mismo comando → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/motor/recolector/instagram.js apps/admin/tests/recolector-instagram.test.js
git commit -m "feat(admin): Instagram del prospecto por Business Discovery de Meta, con cifras calculadas"
```

---

### Task 3: El molde del primer Chequeo (esquema, muestra y plantilla)

Los tres cambian juntos: el esquema nuevo rompe la plantilla vieja.

**Files:**
- Modify (reemplazo completo): `apps/admin/lib/motor/esquema.js`
- Modify: `apps/admin/lib/motor/muestra.js` (solo `comun` y `contenidoMuestra`; `CHEQUEO_MUESTRA` y
  `EMPRENDEDOR_MUESTRA` no cambian)
- Modify: `apps/admin/lib/motor/plantilla.js` (estilos y `htmlChequeo`; `PORTADAS`, `FLECHA`, `linea`, `e`,
  `losRecursos` y la portada no cambian)
- Test (reemplazo completo): `apps/admin/tests/motor-esquema.test.js`, `apps/admin/tests/motor-plantilla.test.js`

**Interfaces:**
- Produces: `contenidoSchema` v2. Los nombres y la forma son exactos:
  - **Común:** `trato` ("tu" o "ustedes"), `portada.dedicatoria`, `cierre`, `fuentes`, `notasInternas`.
  - **Negocio:**
    - `bueno { guia, felicitacion[{valor,texto}], conecta?{titulo, items[{que, valor:number}]}, patron }`
    - `sintomas { guia, items[{titulo, vimos, importa, marca, supuesto?}] }`
    - `recetas { guia, items[{titulo, como}], dimensionar?{texto, supuesto} }`
    - `noSeVe { guia, intro, preguntas[] }`
  - **Emprendedor:**
    - `bueno { guia, felicitacion[], patron }`
    - `idea { guia, viable, porque, leFalta[] }`
    - `pasos { guia, items[] }`
    - `siguienteNivel { guia, texto }`
  - **`guia`** = `{ texto, mano, despues? }`.
- `contenidoMuestra(etapa)` devuelve contenido v2 válido.
- `htmlChequeo(c, k, { fecha }?)` con la misma firma.

- [ ] **Step 1: Write the failing tests.** `apps/admin/tests/motor-esquema.test.js` (reemplazo completo):

```js
import { describe, expect, it } from "vitest";
import { contenidoSchema } from "../lib/motor/esquema.js";
import { contenidoMuestra } from "../lib/motor/muestra.js";

describe("contenidoSchema v2", () => {
  it("acepta las muestras de negocio y de emprendedor", () => {
    expect(contenidoSchema.safeParse(contenidoMuestra("creciendo")).success).toBe(true);
    expect(contenidoSchema.safeParse(contenidoMuestra("idea")).success).toBe(true);
  });

  it("un emprendedor solo puede ser etapa idea; un negocio nunca", () => {
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("idea"), etapaProspecto: "creciendo" }).success).toBe(false);
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("creciendo"), etapaProspecto: "idea" }).success).toBe(false);
  });

  it("un síntoma estimado sin supuesto no pasa", () => {
    const k = contenidoMuestra("creciendo");
    k.sintomas.items[0] = { ...k.sintomas.items[0], marca: "estimacion", supuesto: undefined };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });

  it("trato solo tu o ustedes; la guía lleva su frase a mano", () => {
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("creciendo"), trato: "usted" }).success).toBe(false);
    const k = contenidoMuestra("creciendo");
    k.bueno.guia = { texto: "Solo texto" };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });

  it("de 3 a 5 preguntas en lo que no se ve", () => {
    const k = contenidoMuestra("creciendo");
    k.noSeVe.preguntas = ["¿Una?"];
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });

  it("una fuente que no es http(s) no pasa", () => {
    const k = { ...contenidoMuestra("creciendo"), fuentes: [{ url: "javascript:alert(1)", que: "x" }] };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });
});
```

`apps/admin/tests/motor-plantilla.test.js` (reemplazo completo):

```js
import { describe, expect, it } from "vitest";
import { PORTADAS, htmlChequeo } from "../lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, EMPRENDEDOR_MUESTRA, contenidoMuestra } from "../lib/motor/muestra.js";

const negocio = (k = contenidoMuestra("creciendo")) => htmlChequeo(CHEQUEO_MUESTRA, k);
const veces = (html, s) => html.split(s).length - 1;

describe("plantilla v2", () => {
  it("cada etapa usa su portada", () => {
    for (const etapa of ["arrancando", "creciendo", "consolidado"]) {
      expect(htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra(etapa))).toContain(PORTADAS[etapa].frase);
    }
    expect(htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"))).toContain(PORTADAS.idea.frase);
  });

  it("la dedicatoria va solo en la portada", () => {
    const k = contenidoMuestra("creciendo");
    expect(veces(negocio(k), k.portada.dedicatoria)).toBe(1);
  });

  it("la página 2 es el texto del dueño, conjugado", () => {
    const tu = negocio();
    expect(tu).toContain("¿Por qué hice esto?");
    expect(tu).toContain("Revisé <b>Café Ejemplo</b> porque mi objetivo es ayudar");
    expect(tu).toContain("Tu negocio tiene el potencial que le viste al inicio.");
    const ustedes = negocio({ ...contenidoMuestra("creciendo"), trato: "ustedes" });
    expect(ustedes).toContain("Su negocio tiene el potencial que le vieron al inicio.");
    expect(ustedes).toContain("me reflejo en su negocio.");
    const idea = htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"));
    expect(idea).toContain("Revisé tu idea porque");
    expect(idea).toContain("Tu idea tiene el potencial que le viste al inicio.");
  });

  it("cada sección abre con su guía y su frase a mano", () => {
    const html = negocio();
    expect(html).toContain('<p class="lead">Tienes algo que no se compra: <span class="hand">gente que quiere volver.</span></p>');
    expect(html).toContain('<span class="hand">Sin costo,</span> y la mayoría en una tarde.');
  });

  it("lo bueno, los síntomas, la receta y lo que no se ve como el original", () => {
    const html = negocio();
    expect(html).toContain("Lo que más conecta con tu gente");
    expect(html).toContain("<em>120</em>");
    expect(html).toContain("Lo que vimos");
    expect(html).toContain("Por qué importa");
    expect(html).toContain("Estimación");
    expect(html).toContain("10 cafés de $60 por día hábil");
    expect(html).toContain("Para dimensionar:");
    expect(html).toContain("¿Qué pasa el día que tú no estás?");
    expect(html).toContain("¿Lo platicamos?");
    expect(html).toContain("WhatsApp 444 849 6561");
  });

  it("escapa el texto de la IA y nunca muestra notas internas", () => {
    const k = contenidoMuestra("creciendo");
    k.bueno.patron = '<script>alert("x")</script>';
    const html = negocio(k);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Respuestas cortas pero cálidas.");
    expect(html).not.toContain("Mensaje mencionando a su abuela.");
  });

  it("el emprendedor ve lo que lo mueve, su idea, sus pasos y el siguiente nivel", () => {
    const html = htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"));
    expect(html).toContain("Lo que te mueve");
    expect(html).toContain("Tus primeros pasos");
    expect(html).toContain("El Kit Arranque");
    expect(veces(html, '<section class="page')).toBe(6);
  });

  it("incrusta los tokens y el monograma", () => {
    const html = negocio();
    expect(html).toContain("--brand-navy");
    expect(html).toContain("data:image/svg+xml;base64,");
    expect(veces(html, '<section class="page')).toBe(6);
  });
});
```

- [ ] **Step 2: Run to verify they fail** —
  `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-esquema.test.js tests/motor-plantilla.test.js` → FAIL.

- [ ] **Step 3: `apps/admin/lib/motor/esquema.js`** (reemplazo completo):

```js
// Lo que el modelo tiene que devolver para que exista un Chequeo, con el molde del primer Chequeo de Boreal (spec
// 2026-10-05-chequeo-como-el-primero-design.md, sección 5). Si no pasa, el motor reintenta una vez y luego marca error.
// Los textos se ven en el PDF tal cual. La página 2 no es de la IA: es el texto fijo del dueño (plantilla.js).
import { z } from "zod";

const texto = z.string().trim().min(1);
// La línea con la que abre cada sección: "texto <mano> despues"; `mano` va en letra a mano.
const guia = z.object({ texto, mano: texto, despues: z.string().trim().optional() });
const accion = z.object({ titulo: texto, como: texto });
const kpi = z.object({ valor: texto, texto });

const sintoma = z
  .object({
    titulo: texto,
    vimos: texto,
    importa: texto,
    marca: z.enum(["dato", "estimacion"]),
    supuesto: z.string().trim().optional(),
  })
  .refine((s) => s.marca === "dato" || s.supuesto, { path: ["supuesto"], message: "Una estimación lleva su supuesto" });

const comun = {
  trato: z.enum(["tu", "ustedes"]),
  portada: z.object({ dedicatoria: texto }),
  cierre: texto,
  fuentes: z.array(z.object({ url: z.url({ protocol: /^https?$/ }), que: texto })).default([]),
  notasInternas: z.object({
    comoEscribe: texto,
    tiempo: texto,
    sinConfirmar: z.array(texto).default([]),
    siguientePaso: texto,
  }),
};

export const contenidoNegocio = z.object({
  tipo: z.literal("negocio"),
  etapaProspecto: z.enum(["arrancando", "creciendo", "consolidado"]),
  ...comun,
  bueno: z.object({
    guia,
    felicitacion: z.array(kpi).min(1).max(3),
    conecta: z
      .object({ titulo: texto, items: z.array(z.object({ que: texto, valor: z.number().nonnegative() })).min(2).max(6) })
      .optional(),
    patron: texto,
  }),
  sintomas: z.object({ guia, items: z.array(sintoma).min(1).max(5) }),
  recetas: z.object({
    guia,
    items: z.array(accion).min(1).max(5),
    dimensionar: z.object({ texto, supuesto: texto }).optional(),
  }),
  noSeVe: z.object({ guia, intro: texto, preguntas: z.array(texto).min(3).max(5) }),
});

export const contenidoEmprendedor = z.object({
  tipo: z.literal("emprendedor"),
  etapaProspecto: z.literal("idea"),
  ...comun,
  bueno: z.object({ guia, felicitacion: z.array(kpi).max(3).default([]), patron: texto }),
  idea: z.object({ guia, viable: z.boolean(), porque: texto, leFalta: z.array(texto).min(1).max(6) }),
  pasos: z.object({ guia, items: z.array(accion).min(1).max(7) }),
  siguienteNivel: z.object({ guia, texto }),
});

export const contenidoSchema = z.discriminatedUnion("tipo", [contenidoNegocio, contenidoEmprendedor]);
```

- [ ] **Step 4: `apps/admin/lib/motor/muestra.js`.** Reemplaza desde `const comun = {` hasta el final del archivo por:

```js
const comun = {
  trato: "tu",
  portada: { dedicatoria: "Para Ana, que convirtió el café de su abuela en un lugar al que la gente quiere volver." },
  cierre: "Veinte minutos, en tu café o en línea, cuando te acomode. Sin compromiso: si solo te quedas con este documento, ya valió la pena.",
  fuentes: [{ url: "https://ejemplo.com", que: "Sitio web" }],
  notasInternas: {
    comoEscribe: "Respuestas cortas pero cálidas.",
    tiempo: "Contestó el mismo día, en 7 minutos.",
    sinConfirmar: ["Ventas por día"],
    siguientePaso: "Mensaje mencionando a su abuela.",
  },
};

export function contenidoMuestra(etapa = "creciendo") {
  if (etapa === "idea") {
    return {
      tipo: "emprendedor",
      etapaProspecto: "idea",
      ...structuredClone(comun),
      bueno: {
        guia: { texto: "Lo que te mueve", mano: "se nota en cómo lo cuentas." },
        felicitacion: [],
        patron: "Quieres hornear y enseñar a comer rico sin culpa: el proceso te llena, no solo el resultado.",
      },
      idea: {
        guia: { texto: "Tu idea", mano: "sí tiene con qué." },
        viable: true,
        porque: "Hay demanda local de postres sin azúcar.",
        leFalta: ["Saber cuánto cobrar", "Un primer canal de pedidos"],
      },
      pasos: {
        guia: { texto: "Pasos chiquitos,", mano: "a tu medida." },
        items: [{ titulo: "Hornea 3 recetas de prueba", como: "Regálalas a 10 personas y anota qué dicen." }],
      },
      siguienteNivel: {
        guia: { texto: "Cuando des esos pasos,", mano: "esto es lo que sigue." },
        texto: "El Kit Arranque te da las plantillas para ordenar pedidos y números desde el día uno.",
      },
    };
  }
  return {
    tipo: "negocio",
    etapaProspecto: etapa,
    ...structuredClone(comun),
    bueno: {
      guia: { texto: "Tienes algo que no se compra:", mano: "gente que quiere volver." },
      felicitacion: [
        { valor: "4.7", texto: "de calificación en Google." },
        { valor: "≈ 3 %", texto: "de tus seguidores reacciona en cada publicación." },
      ],
      conecta: {
        titulo: "Lo que más conecta con tu gente",
        items: [
          { que: "Tu abuela tostando café", valor: 120 },
          { que: "El latte del mes", valor: 64 },
        ],
      },
      patron: "Lo que más mueve es la historia de tu familia. Eso ya es tu mejor activo.",
    },
    sintomas: {
      guia: { texto: "Dos síntomas. Ninguno es grave, pero", mano: "juntos cuestan." },
      items: [
        { titulo: "El menú no tiene precios en línea", vimos: "La página /menu solo dice 'Pregunta en barra'.", importa: "Quien no ve precio se va.", marca: "dato" },
        { titulo: "Tardes vacías", vimos: "Google marca poca afluencia de 16 a 18 h.", importa: "Son horas pagadas sin venta.", marca: "estimacion", supuesto: "10 cafés de $60 por día hábil" },
      ],
    },
    recetas: {
      guia: { texto: "Una receta por síntoma.", mano: "Sin costo,", despues: "y la mayoría en una tarde." },
      items: [
        { titulo: "Pon los precios en tu sitio", como: "Una foto del menú en la página de inicio." },
        { titulo: "Una promoción de tarde", como: "Café y pan a precio fijo de 16 a 18 h." },
      ],
      dimensionar: { texto: "cada tarde con 10 cafés más son unos $3,000 a la semana.", supuesto: "10 cafés de $60 por día hábil" },
    },
    noSeVe: {
      guia: { texto: "La receta baja los síntomas.", mano: "La causa se ve por dentro." },
      intro: "Desde afuera no podemos contestar las preguntas que más pesan en tu día a día:",
      preguntas: ["¿Cuánto deja cada producto?", "¿Qué horas se llenan y cuáles casi nunca?", "¿Qué pasa el día que tú no estás?"],
    },
  };
}
```

- [ ] **Step 5: `apps/admin/lib/motor/plantilla.js`.**
  - Primero lee el archivo. Conserva `PORTADAS`, `FLECHA`, `linea`, `e`, `losRecursos`, `mes`, `dia` y el CSS de la
    portada.
  - Al final de la cadena `ESTILOS`, justo antes del cierre `` ` `` y después de la regla `.yellow h2`, agrega:

```css
  .lead { font-size: 14pt; font-weight: 400; letter-spacing: -.02em; line-height: 1.32; margin-bottom: 7mm; }
  .cols { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 7mm; }
  .kpi { border-top: .4mm solid var(--brand-navy); padding-top: 3mm; }
  .kpi b { display: block; font-size: 22pt; font-weight: 300; letter-spacing: -.03em; }
  .kpi span { font-size: 9pt; line-height: 1.35; display: block; color: color-mix(in srgb, var(--brand-navy) 72%, var(--brand-ivory)); }
  .num { font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 13pt; color: var(--brand-amber-paper); margin-right: 2mm; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .row p { font-size: 9.4pt; line-height: 1.45; }
  .label { font-size: 7.8pt; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 1mm; color: color-mix(in srgb, var(--brand-navy) 72%, var(--brand-ivory)); }
  .pill h3 { color: var(--brand-ivory); }
  .pill p { color: color-mix(in srgb, var(--brand-ivory) 85%, var(--brand-navy)); font-size: 9.8pt; }
  .pill .num { color: var(--brand-amber); }
  .bars { margin-top: 2mm; }
  .bar { display: grid; grid-template-columns: 58mm 1fr 12mm; align-items: center; gap: 3mm; font-size: 9.3pt; margin-top: 2.2mm; }
  .bar i { display: block; height: 3.2mm; border-radius: 2mm; background: var(--brand-navy); }
  .bar em { font-style: normal; font-weight: 600; text-align: right; }
  .note { font-size: 8.6pt !important; margin-top: 4mm; color: color-mix(in srgb, var(--brand-navy) 72%, var(--brand-ivory)); }
  .sign { margin-top: 8mm; }
  .sign .hand { font-size: 20pt; }
  .q { padding-left: 5mm; margin-top: 4mm; }
  .q li { margin-bottom: 2mm; }
  .contacto { margin-top: 4mm; font-size: 9pt !important; }
```

  - Reemplaza la función `htmlChequeo` completa por esto (y agrega las tres funciones auxiliares encima de ella):

```js
const CONTACTO = "Jose Carlos Salinas · WhatsApp 444 849 6561 · salinas@jotapuntoce.com";
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const guiaDe = (g) => `<p class="lead">${e(g.texto)} <span class="hand">${e(g.mano)}</span>${g.despues ? ` ${e(g.despues)}` : ""}</p>`;

// La página 2: texto del dueño (2026-10-05), no de la IA. Solo cambia la conjugación (tú / ustedes) y negocio / idea.
function porQueHice(c, k) {
  const idea = c.tipo !== "negocio";
  const ustedes = k.trato === "ustedes";
  const suyo = idea ? (ustedes ? "su idea" : "tu idea") : ustedes ? "su negocio" : "tu negocio";
  const nombre = idea ? suyo : `<b>${e(c.negocio)}</b>`;
  const lo = idea ? "la" : "lo";
  return `<h2>¿Por qué hice esto?</h2>
<p>Revisé ${nombre} porque mi objetivo es ayudar a los dueños y emprendedores a que la visión que tuvieron se cumpla. Ayudar está en mi gen: es mi propósito y lo que me gusta hacer.</p>
<p>Primero vi ${nombre} como ${lo} vería un prospecto que ${idea ? "la descubre" : "los descubre"} hoy, analizando todo lo que se ve desde afuera, y me encantaría ver${lo} desde adentro. ${mayuscula(suyo)} tiene el potencial que ${ustedes ? "le vieron" : "le viste"} al inicio. Yo también lo veo, y quiero que ese potencial de verdad explote, porque me reflejo en ${suyo}.</p>
<div class="sign"><p><span class="hand">Con gusto,</span></p><p><b>Jose Carlos Salinas</b> · JotaPuntoCe</p></div>`;
}

export function htmlChequeo(c, k, { fecha = new Date() } = {}) {
  const { tokens, monograma } = losRecursos();
  const nombre = c.tipo === "negocio" ? c.negocio : "tu idea";
  const para = c.nombre ?? (c.tipo === "negocio" ? `el equipo de ${c.negocio}` : "ti");
  const portada = PORTADAS[k.etapaProspecto];
  let n = 0;
  const pagina = (titulo, cuerpo) => {
    n += 1;
    return `<section class="page"><div class="head"><img src="${monograma}" alt="J·C"><span>${e(titulo)}</span></div>${cuerpo}<div class="foot"><span>Hecho solo para ${e(c.negocio ?? para)}</span><span>${n}</span></div></section>`;
  };
  const lista = (xs, clase = "") => `<ul class="${clase}">${xs.map((x) => `<li>${e(x)}</li>`).join("")}</ul>`;
  const acciones = (xs) =>
    xs.map((a, i) => `<div class="pill"><h3><span class="num">${i + 1}</span>${e(a.titulo)}</h3><p>${e(a.como)}</p></div>`).join("");
  const kpis = (xs) =>
    xs.length ? `<div class="cols">${xs.map((f) => `<div class="kpi"><b>${e(f.valor)}</b><span>${e(f.texto)}</span></div>`).join("")}</div>` : "";
  const barras = (cx) => {
    const max = Math.max(1, ...cx.items.map((i) => i.valor));
    return `<h3 style="margin-top:9mm">${e(cx.titulo)}</h3><div class="bars">${cx.items
      .map((i) => `<div class="bar"><span>${e(i.que)}</span><i style="width:${Math.round((i.valor / max) * 100)}%"></i><em>${Number(i.valor)}</em></div>`)
      .join("")}</div>`;
  };
  const platicamos = `<div class="yellow"><h2>¿Lo platicamos?</h2><p>${e(k.cierre)}</p><p class="contacto">${CONTACTO}</p></div>`;

  const paginas = [
    pagina(
      `Chequeo · ${mes.format(fecha)}`,
      `${portada.trazo}<p class="senal">${FLECHA}${e(c.tipo === "negocio" ? c.negocio : "Tu idea")} <span class="hand">${e(portada.frase)}</span></p><div class="block"><h1>Chequeo de ${e(nombre)}</h1><div class="for">Preparado para <b>${e(para)}</b><br>${e(k.portada.dedicatoria)}</div></div><div class="meta"><div><b>Jose Carlos Salinas</b>Preparado por</div><div><b>${dia.format(fecha)}</b>Fecha</div><div><b>Un regalo</b>No cuesta nada</div></div>`,
    ).replace('class="page"', 'class="page cover"'),
    pagina("Antes de empezar", porQueHice(c, k)),
  ];

  if (k.tipo === "negocio") {
    const { bueno: b, sintomas: s, recetas: r, noSeVe: x } = k;
    paginas.push(
      pagina(
        "Lo que ya funciona",
        `<h2>Primero, lo bueno</h2>${guiaDe(b.guia)}${kpis(b.felicitacion)}${b.conecta ? barras(b.conecta) : ""}<p style="margin-top:7mm">${e(b.patron)}</p>`,
      ),
      pagina(
        "Los síntomas",
        `<h2 style="margin-top:9mm">Lo que se ve desde afuera</h2>${guiaDe(s.guia)}${s.items
          .map(
            (p, i) =>
              `<div class="card"><h3><span class="num">${i + 1}</span>${e(p.titulo)}<span class="tag">${p.marca === "dato" ? "Dato" : "Estimación"}</span></h3><div class="row"><div><div class="label">Lo que vimos</div><p>${e(p.vimos)}</p></div><div><div class="label">Por qué importa</div><p>${e(p.importa)}${p.supuesto ? ` <i>(supuesto: ${e(p.supuesto)})</i>` : ""}</p></div></div></div>`,
          )
          .join("")}`,
      ),
      pagina(
        "La receta",
        `<h2>Lo que pueden hacer desde mañana</h2>${guiaDe(r.guia)}${acciones(r.items)}${r.dimensionar ? `<p class="note">Para dimensionar: ${e(r.dimensionar.texto)} <i>(supuesto: ${e(r.dimensionar.supuesto)})</i></p>` : ""}`,
      ),
      pagina(
        "Lo que no se ve desde afuera",
        `<h2>La parte que no se ve</h2>${guiaDe(x.guia)}<p>${e(x.intro)}</p>${lista(x.preguntas, "q")}${platicamos}`,
      ),
    );
  } else {
    const { bueno: b, idea: i, pasos: p, siguienteNivel: sn } = k;
    paginas.push(
      pagina("Lo que te mueve", `<h2>Lo que te mueve</h2>${guiaDe(b.guia)}${kpis(b.felicitacion)}<p style="margin-top:7mm">${e(b.patron)}</p>`),
      pagina("Tu idea", `<h2>Tu idea</h2>${guiaDe(i.guia)}<p>${e(i.porque)}</p><h3 style="margin-top:6mm">Lo que le falta</h3>${lista(i.leFalta)}`),
      pagina("Tus primeros pasos", `<h2>Tus primeros pasos</h2>${guiaDe(p.guia)}${acciones(p.items)}`),
      pagina("Lo que sigue", `<h2>El siguiente nivel</h2>${guiaDe(sn.guia)}<p>${e(sn.texto)}</p>${platicamos}`),
    );
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Chequeo de ${e(nombre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Caveat:wght@700&family=Inter+Tight:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${tokens}${ESTILOS}</style></head><body>${paginas.join("")}</body></html>`;
}
```

  Las clases de las páginas internas no llevan `.inner`: los estilos de `h2`, `p` y `li` del archivo ya aplican a
  todas.

- [ ] **Step 6: Run** —
  `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-esquema.test.js tests/motor-plantilla.test.js tests/motor-pdf.test.js tests/motor-armar.test.js`
  → PASS. El PDF sigue en 6 páginas y armar sigue en verde porque usa `contenidoMuestra`.

- [ ] **Step 7: Render check** — con este script temporal, saca las 6 páginas de la muestra a PNG y míralas (texto
  encimado, desbordes):
  - Guárdalo como `apps/admin/_ver.tmp.mjs`.
  - Córrelo con `node --no-warnings _ver.tmp.mjs <carpeta>` desde `apps/admin`.
  - Bórralo al terminar.

```js
import { chromium } from "playwright-core";
import { htmlChequeo } from "./lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, contenidoMuestra } from "./lib/motor/muestra.js";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 794, height: 1123 } });
await p.setContent(htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo")), { waitUntil: "networkidle" });
for (let i = 0; i < 6; i++) await p.locator("section.page").nth(i).screenshot({ path: `${process.argv[2]}/p${i + 1}.png` });
await b.close();
```

- [ ] **Step 8: Commit**

```bash
git add apps/admin/lib/motor/esquema.js apps/admin/lib/motor/muestra.js apps/admin/lib/motor/plantilla.js apps/admin/tests/motor-esquema.test.js apps/admin/tests/motor-plantilla.test.js
git commit -m "feat(admin): el Chequeo con el molde del primero (guías a mano, lo que vimos, para dimensionar, página 2 del dueño)"
```

---

### Task 4: El método con el primer Chequeo como ejemplo

**Files:**
- Create: `apps/admin/lib/motor/ejemplo-boreal.js`
- Modify (reemplazo de `METODO_VERSION`, `METODO` y `mensajeDe`; `senales` no cambia): `apps/admin/lib/motor/metodo.js`
- Modify: `apps/admin/tests/motor-metodo.test.js`

**Interfaces:**
- Consumes: el esquema v2 (Task 3) para describir el JSON.
- Produces: `METODO_VERSION = "2026-10-05.2"`; `mensajeDe(c, { nota, expediente }?) → string`. El expediente tiene la
  forma `{ fecha, sitio: {ok, data|motivo}, instagram: {ok, data|motivo} }`.

- [ ] **Step 1: Tests.** En `apps/admin/tests/motor-metodo.test.js`, reemplaza el último `it` ("el método trae las
  reglas…") por estos dos:

```js
  it("el método trae las reglas y el primer Chequeo como ejemplo de forma", () => {
    for (const regla of ["dato", "estimacion", "Plática", "Kit Arranque", "ÚNICAMENTE un objeto JSON", "nunca sus datos", "Toti", '"trato"', '"vimos"']) {
      expect(METODO).toContain(regla);
    }
  });

  it("el mensaje lleva el expediente y dice qué no se pudo ver", () => {
    const expediente = {
      fecha: "2026-10-05T18:00:00.000Z",
      sitio: { ok: true, data: { url: "https://ejemplo.com", enlacesRotos: [{ texto: "Blog", href: "https://ejemplo.com/blog", status: 404 }] } },
      instagram: { ok: false, motivo: "Instagram sin configurar (faltan META_IG_USER_ID y META_ACCESS_TOKEN)." },
    };
    const m = mensajeDe(CHEQUEO_MUESTRA, { expediente });
    expect(m).toContain("## Expediente");
    expect(m).toContain("https://ejemplo.com/blog");
    expect(m).toContain("No se pudo ver: instagram — Instagram sin configurar");
  });
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-metodo.test.js`
  → FAIL.

- [ ] **Step 3: `apps/admin/lib/motor/ejemplo-boreal.js`** (el texto del PDF original, `Chequeo-Boreal.pdf`):

```js
// El primer Chequeo, hecho a mano (Boreal, 2026-09-28) y aprobado por el dueño: el ejemplo de forma, tono y nivel
// de análisis que sigue el motor. Sus datos son de Boreal y nunca se copian a otro Chequeo.
export const EJEMPLO_BOREAL = `PÁGINA 1 · PORTADA
Chequeo de Boreal. Preparado para las socias de Boreal. Lo que se ve desde afuera, y lo que se puede hacer desde mañana.

PÁGINA 2 · ANTES DE EMPEZAR
(Esta página hoy es un texto fijo del dueño; no la escribes tú.)
"Para las socias de Boreal: Levantar un club entre amigas, con pádel, Studio B y Serenna bajo el mismo techo, y llegar a 4.8 en cinco meses no es suerte: es cuidar cada detalle, como ustedes mismas lo escriben en sus valores. Esto lo hicimos con el mismo cuidado. Ojalá les ahorre tiempo en lo que sigue."

PÁGINA 3 · PRIMERO, LO BUENO
Guía: Tienen algo que no se compra: [mano] gente que quiere volver.
- 4.8 de calificación en Google, con apenas cinco meses abiertos.
- ≈ 4 % de sus seguidores reacciona en cada publicación (46 interacciones en promedio). Para una cuenta de su tamaño, es una comunidad viva.
Lo que más conecta con su gente (likes + comentarios de sus publicaciones con más respuesta):
Toti, su coach, llegando de Argentina 138 · La cuenta regresiva de abril 104 · "No hay novi@s, hay pádel" 103 · El pasto morado de la preapertura 98 · Las coaches de Studio B 73 · El primer torneo exprés 65
El patrón es claro: lo que más mueve son las personas y la comunidad. Caras con nombre, humor, y el torneo. Eso ya es su mejor activo, y encaja con lo que ustedes mismas dicen de Boreal: aquí no vienes solo a hacer ejercicio, vienes a vivir Boreal.

PÁGINA 4 · LO QUE SE VE DESDE AFUERA
Guía: Cinco síntomas. Ninguno es grave, pero [mano] juntos cuestan.
1 La promoción está desplazando a la comunidad. Lo que vimos: En septiembre, casi todas las publicaciones fueron promoción ("tu primera clase es gratis"). El promedio bajó a 23 interacciones, la mitad de lo normal. Esos posts sacaron 7, 12 y 13. Por qué importa: Instagram le muestra menos la cuenta a quien no reacciona. Menos alcance hoy es menos gente preguntando mañana.
2 La puerta de entrada tiene piezas sueltas. Lo que vimos: En la página, los botones de Instagram, Blog y Comunidad regresan al inicio. La sección de Torneos dice "muy pronto" desde enero. La de Serenna solo muestra "Menú". En el celular, la página se sale de lado. Por qué importa: Casi todos llegan desde Instagram, en el celular. Si algo no abre, no preguntan: se van a otro de los 18 a 24 clubes de pádel que hay en San Luis.
3 Las clínicas no tienen precio a la vista. Lo que vimos: La página de clínicas dice "acércate a recepción". Las canchas y Studio B sí tienen precio y reserva en línea. Por qué importa: Un precio escondido se lee como "caro" o "complicado". La clínica con Pablo Scorcelli se anunció a $3,500 y su post sacó 6 interacciones.
4 Una franja que no se ofrece. Lo que vimos: La reserva en línea ofrece cancha de 7 a 16 h ($400) y de 18 a 21 h ($650). De 16 a 18 h no aparece nada. Por qué importa: Si es a propósito, perfecto. Si no, son dos horas diarias por cancha que no se pueden comprar desde el celular.
5 El torneo que funcionó no se repitió. Lo que vimos: El torneo exprés de junio fue de lo que más respuesta tuvo. No encontramos un segundo torneo publicado. Por qué importa: Un torneo cada mes es la razón más fuerte para que un jugador vuelva, traiga a alguien y reserve cancha para prepararse.

PÁGINA 5 · LO QUE PUEDEN HACER DESDE MAÑANA
Guía: Una receta por síntoma. [mano] Sin costo, y la mayoría en una tarde.
1 Tres de cada cuatro publicaciones, de personas. Toti, las coaches, los jugadores de la semana, un partido con humor. Dejen la promoción para la cuarta, y que la cuente una cara conocida: "Soy Toti, tu primera clínica va por mi cuenta" pesa más que un cartel.
2 Una revisión de 30 minutos a la página, desde el celular. Conectar Instagram, Blog y Comunidad a donde deben ir; poner el menú de Serenna; quitar el "muy pronto" o cambiarlo por la fecha del siguiente torneo; y revisar la vista de celular.
3 El precio de las clínicas, publicado. Aunque sea "desde $___". Con un botón de reserva o de WhatsApp al lado. Lo que se ve fácil de comprar se compra más.
4 Decidir qué pasa de 16 a 18 h. Si está cerrada a propósito, que lo diga la página. Si no, abrirla en la reserva en línea, o convertirla en una franja con nombre ("la hora de la salida del trabajo") y precio especial.
5 Un torneo exprés con fecha fija cada mes. El mismo sábado de cada mes, anunciado por Toti o las coaches, con inscripción por DM. Es su mejor contenido y su mejor razón para volver, en una sola acción.
Para dimensionar: cada turno nocturno que queda sin reservar son $650. Llenar uno más al día equivale a unos $19,500 al mes (cálculo con 30 días, a su precio publicado).

PÁGINA 6 · LA PARTE QUE NO SE VE
Guía: La receta baja los síntomas. [mano] La causa se ve por dentro.
Boreal son tres negocios en uno (pádel, Studio B y Serenna) dirigidos por varias socias. Desde afuera no podemos contestar las preguntas que más pesan en el día a día:
¿Qué franjas y qué canchas se llenan, y cuáles casi nunca? ¿Cuánto deja cada línea del negocio, y cuál sostiene a las otras? ¿Cuántos jugadores y alumnas regresan cada mes, y cuántos no vuelven? ¿Todas las socias ven los mismos números, al mismo tiempo? ¿Qué pasa el día que una de ustedes no puede estar?
¿Lo platicamos? Veinte minutos, en Boreal, cuando les acomode. Sin compromiso: si solo se quedan con este documento, ya valió la pena para nosotros.`;
```

- [ ] **Step 4: `apps/admin/lib/motor/metodo.js`.**
  - Agrega `import { EJEMPLO_BOREAL } from "./ejemplo-boreal.js";` debajo del import de `CANAL_LABEL`.
  - Cambia `METODO_VERSION` a `"2026-10-05.2"`.
  - Reemplaza la constante `METODO` completa por:

```js
export const METODO = `Eres Improvement, el director digital de JotaPuntoCe. Armas el Chequeo de regalo de un negocio, o
de la idea de un emprendedor: una revisión desde afuera con los síntomas que se ven y una receta para actuar desde
mañana. Lo firma Jose Carlos Salinas. Su gen es ayudar: el Chequeo se hace con cariño, nunca como trámite.

# Cómo trabajas
1. Te paso un EXPEDIENTE que juntó el código: su sitio recorrido en un navegador (páginas, precios, textos "muy
   pronto", enlaces rotos o que regresan al inicio, si en celular se sale de lado) y su Instagram (seguidores,
   promedio de interacciones, sus posts con más respuesta, el promedio por mes y por tipo). Todo eso es dato:
   úsalo tal cual y di de dónde sale.
2. Completa con web_search y web_fetch lo que el expediente no trae: su calificación y reseñas de Google, notas
   sobre el negocio, su competencia en la ciudad. Si algo no lo ves, va a notasInternas.sinConfirmar; nunca lo
   inventes.
3. Vívelo como cliente y luego piénsalo como dueño: qué le deja dinero, qué se le escapa, qué le quita el sueño.
   Usa la lógica de su tipo de negocio: con local, ocupación × precio por franja; creador o en línea, audiencia y
   conversión; servicios, agenda y ticket promedio.

# Cómo suena (el ejemplo de abajo es la vara)
- Lo bueno abre FELICITANDO con datos concretos ("llegar a 4.8 en cinco meses no es suerte"), analiza qué conecta
  con su gente (sus posts o reseñas con más respuesta, con la cifra) y amarra el patrón a SUS propias palabras (su
  bio, sus valores, los textos de su sitio).
- Cada sección abre con una guía corta con una frase a mano que pega ("Tienen algo que no se compra: gente que
  quiere volver.").
- Cada síntoma dice lo que vimos (concreto, con cifra o cita) y por qué importa (en su mundo, con sus clientes).
  "Ninguno es grave, pero juntos cuestan." Máximo 5, del más al menos importante.
- Una receta por síntoma, que pueden hacer ellos mismos desde mañana, sin pagarle a nadie; la mayoría en una
  tarde. Concretas: con el nombre de su gente, sus servicios y sus precios.
- Para dimensionar: una estimación en pesos con su precio publicado y su supuesto.
- Lo que no se ve: 3 a 5 preguntas que solo se contestan por dentro (números reales, quién hace qué, qué pasa si el
  dueño falta). Es lo que se ve en un Diagnóstico 360; menciónalo sin venderlo.
- cierre: invita a la Plática, de 20 a 60 minutos, para conocer a la persona: qué busca y qué quiere para su negocio
  y su vida. Una invitación, nunca una venta. Sin precios.
- trato: "tu" si es una persona; "ustedes" si son socios o un equipo. Todo el Chequeo usa ese trato.
- Voz de JotaPuntoCe: casual-formal, directa, ingeniosa sin que el chiste tape el dato. Español de México.
  Venta pull: sin urgencia, sin presión, sin asustar. Nada privado que no nos hayan contado.
- Emprendedor: dile con honestidad si la idea es viable hoy y qué le falta. Los pasos son babysteps a su medida,
  según "¿Con qué cuentas hoy para arrancar?". siguienteNivel presenta el Kit Arranque como la puerta siguiente,
  sin empujar. Lo bueno es "lo que te mueve" (su pregunta 1).

# Reglas que no se rompen
- Cada cifra es "dato" (la viste; di dónde) o "estimacion" (la calculaste; con su supuesto). Nunca inventes
  cifras, reseñas, testimonios, clientes ni posts.
- portada.dedicatoria: una frase para la persona o las socias, con algo suyo de verdad. Solo va en la portada.
- notasInternas (solo las ve Jose Carlos, nunca van al PDF): comoEscribe (largo, tono y si se abrió o contestó por
  cumplir; usa las señales), tiempo, sinConfirmar (lo que no pudiste ver) y siguientePaso.

# El ejemplo: el primer Chequeo de Boreal
Copia la forma, el tono y el nivel de análisis; nunca sus datos. Es de otro negocio.
---
${EJEMPLO_BOREAL}
---

# Respuesta
Al terminar de investigar, responde ÚNICAMENTE un objeto JSON, sin texto antes ni después. Cada "guia" es
{"texto":"","mano":"","despues":""} (despues es opcional; se lee "texto mano despues").
Negocio:
{"tipo":"negocio","etapaProspecto":"arrancando|creciendo|consolidado","trato":"tu|ustedes",
"portada":{"dedicatoria":""},
"bueno":{"guia":{},"felicitacion":[{"valor":"4.8","texto":""}],"conecta":{"titulo":"","items":[{"que":"","valor":0}]},"patron":""},
"sintomas":{"guia":{},"items":[{"titulo":"","vimos":"","importa":"","marca":"dato|estimacion","supuesto":""}]},
"recetas":{"guia":{},"items":[{"titulo":"","como":""}],"dimensionar":{"texto":"","supuesto":""}},
"noSeVe":{"guia":{},"intro":"","preguntas":[""]},
"cierre":"","fuentes":[{"url":"","que":""}],
"notasInternas":{"comoEscribe":"","tiempo":"","sinConfirmar":[""],"siguientePaso":""}}
Emprendedor:
{"tipo":"emprendedor","etapaProspecto":"idea","trato":"tu|ustedes","portada":{"dedicatoria":""},
"bueno":{"guia":{},"felicitacion":[],"patron":""},"idea":{"guia":{},"viable":true,"porque":"","leFalta":[""]},
"pasos":{"guia":{},"items":[{"titulo":"","como":""}]},"siguienteNivel":{"guia":{},"texto":""},
"cierre":"","fuentes":[{"url":"","que":""}],"notasInternas":{"comoEscribe":"","tiempo":"","sinConfirmar":[""],"siguientePaso":""}}
etapaProspecto: "arrancando" (primeros clientes, menos de un año), "creciendo" (ya vende y todo pasa por el dueño) o
"consolidado" (estable, busca escalar). felicitacion: 1 a 3 cifras reales. conecta solo si tienes cifras reales
por publicación (2 a 6). Textos cortos: cada sección cabe en una página A4.`;
```

  - En `mensajeDe`, cambia la firma a `export function mensajeDe(c, { nota, expediente } = {})` y, justo antes de
    `if (nota) lineas.push(...)`, agrega:

```js
  if (expediente) {
    const fallas = Object.entries(expediente)
      .filter(([, v]) => v && typeof v === "object" && v.ok === false)
      .map(([k, v]) => `No se pudo ver: ${k} — ${v.motivo}`);
    const datos = Object.fromEntries(Object.entries(expediente).filter(([, v]) => v?.ok).map(([k, v]) => [k, v.data]));
    lineas.push("", "## Expediente (lo que recolectó el código; cada cifra es dato)", ...fallas, JSON.stringify(datos, null, 1));
  }
```

- [ ] **Step 5: Run** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-metodo.test.js` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/lib/motor/ejemplo-boreal.js apps/admin/lib/motor/metodo.js apps/admin/tests/motor-metodo.test.js
git commit -m "feat(admin): método v2 del Chequeo con el primero de Boreal como ejemplo y el expediente en el mensaje"
```

---

### Task 5: Expediente en el motor

**Files:**
- Modify: `packages/db/src/schema.ts` (tabla `chequeo`, después de `fuentes`)
- Generate: `packages/db/migrations/0025_*.sql`
- Create: `apps/admin/lib/motor/recolector/index.js`
- Modify: `apps/admin/lib/motor/armar.js`
- Test: `apps/admin/tests/motor-armar.test.js` (agregar)

**Interfaces:**
- Consumes: `recolectarSitio` (Task 1), `recolectarInstagram` (Task 2), `mensajeDe(c, { nota, expediente })` (Task 4).
- Produces: `recolectar(c, { sitio, instagram }?) → Promise<{ fecha, sitio, instagram }>`, que nunca lanza;
  `armarChequeo(id, opts, deps)` acepta además `deps.recolectar`; columna `chequeo.expediente`.

- [ ] **Step 1: Schema.** En `packages/db/src/schema.ts`, dentro de `chequeo`, justo después de `fuentes: jsonb("fuentes"),`:

```ts
    // Lo que juntó el recolector (sitio e Instagram) para el motor; se reusa 7 días al rehacer.
    expediente: jsonb("expediente"),
```

  Run: `pnpm db:generate` → `migrations\0025_<nombre>.sql` con un `ADD COLUMN "expediente" jsonb`. Run:
  `pnpm db:migrate` → `migrations applied successfully!`

- [ ] **Step 2: Write the failing test** — al final del `describe("armarChequeo", ...)` de
  `apps/admin/tests/motor-armar.test.js`:

```js
  it("recolecta, guarda el expediente, lo manda a la IA y lo reusa al rehacer", async () => {
    const id = await propio();
    let veces = 0;
    const recolectar = async () => {
      veces += 1;
      return { fecha: new Date().toISOString(), sitio: { ok: true, data: { url: "https://ejemplo.com" } }, instagram: { ok: false, motivo: "No dio su Instagram." } };
    };
    const inv = responde(valido());
    await armarChequeo(id, { manual: true }, { investigar: inv, aPdf: pdfFalso, recolectar });
    expect(veces).toBe(1);
    expect((await fila(id)).expediente.sitio.data.url).toBe("https://ejemplo.com");
    expect(inv.llamadas[0].mensajes[0].content).toContain("No se pudo ver: instagram — No dio su Instagram.");
    await armarChequeo(id, { manual: true, nota: "Más corto" }, { investigar: responde(valido()), aPdf: pdfFalso, recolectar });
    expect(veces).toBe(1);
  }, 20_000);
```

- [ ] **Step 3: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-armar.test.js` →
  FAIL (`expediente` undefined).

- [ ] **Step 4: `apps/admin/lib/motor/recolector/index.js`**

```js
// Junta la evidencia del Chequeo antes de la IA (spec 2026-10-05-chequeo-como-el-primero-design.md, sección 2).
// Cada pieza que falla queda como { ok: false, motivo } y las demás siguen. Nunca lanza.
import { recolectarInstagram } from "./instagram.js";
import { recolectarSitio } from "./sitio.js";

const seguro = (p) => p.catch((e) => ({ ok: false, motivo: String(e?.message ?? e) }));

export async function recolectar(c, { sitio = recolectarSitio, instagram = recolectarInstagram } = {}) {
  const enlaces = c.enlaces ?? {};
  const [s, ig] = await Promise.all([
    enlaces.sitio ? seguro(sitio(enlaces.sitio)) : { ok: false, motivo: "No dio sitio web." },
    seguro(instagram(enlaces.instagram)),
  ]);
  return { fecha: new Date().toISOString(), sitio: s, instagram: ig };
}
```

- [ ] **Step 5: `apps/admin/lib/motor/armar.js`.**
  - Agrega `import { recolectar } from "./recolector/index.js";` a los imports.
  - Agrega la constante `const EXPEDIENTE_VIGENTE_MS = 7 * 86_400_000;` debajo de `ARMANDO_ATORADO_MS`.
  - En `armarChequeo`, agrega `const rec = deps.recolectar ?? recolectar;` debajo de `const pdf = ...`.
  - Justo después de `tomada = true;`, inserta:

```js
    const vigente = c.expediente?.fecha && Date.now() - new Date(c.expediente.fecha) < EXPEDIENTE_VIGENTE_MS;
    const expediente = vigente ? c.expediente : await rec(c);
    if (!vigente) await db.update(chequeo).set({ expediente }).where(eq(chequeo.id, id));
```

  - Cambia la primera llamada a la IA para mandar el expediente:
    `mensajeDe(c, { nota, expediente })` (en lugar de `mensajeDe(c, { nota })`).

- [ ] **Step 6: Run** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-armar.test.js` → PASS (todos). Los
  chequeos de prueba no tienen enlaces, así que el recolector real (en las pruebas que no lo inyectan) responde sin
  abrir Chromium.

- [ ] **Step 7: Gate** — `pnpm lint && pnpm typecheck && pnpm test` → verde.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations apps/admin/lib/motor/recolector/index.js apps/admin/lib/motor/armar.js apps/admin/tests/motor-armar.test.js
git commit -m "feat(admin): el motor recolecta evidencia antes de la IA y guarda el expediente"
```

---

### Task 6: Validación con Boreal (la hace el controlador, no un ayudante)

Sin API de Anthropic: el controlador (Claude en la sesión del dueño) hace de cerebro.

- [ ] **Step 1:** Correr `recolectar` real sobre Boreal:
  - script temporal en `apps/admin` que carga `.env.local` con `process.loadEnvFile`;
  - el resultado se guarda en `chequeo.expediente` y en el scratchpad.
- [ ] **Step 2:** Con ese expediente, sin mirar `chequeo-boreal.html`, escribir el contenido con el método v2 y
  pasarlo por `armarChequeo(..., { manual: true, nota: "Molde v2" }, { investigar: <devuelve ese JSON con uso en ceros> })`.
  La nota hace que cuente como "rehecho" en la bitácora.
- [ ] **Step 3:** Sacar las 6 páginas a PNG y compararlas, página por página, contra `Chequeo-Boreal.pdf`:
  felicitación con datos, análisis, empatía, guías a mano, síntomas, recetas, dimensionar y preguntas. Lo que falte
  se corrige en `metodo.js` (sube `METODO_VERSION`) o en la plantilla, y se rehace.
- [ ] **Step 4:** Enseñarle el PDF al dueño. Sin Meta todavía, Instagram queda "sin confirmar"; se repite cuando
  tenga el token.
- [ ] **Step 5:** Commit de cualquier ajuste, gate en verde y documentar con la skill `documentar-proceso`.
