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
    // screen.width, no innerWidth: sin <meta viewport> el móvil maqueta a 980 px y innerWidth lo ocultaría.
    const celular = await pm
      .evaluate(() => ({ anchoPagina: document.documentElement.scrollWidth, anchoPantalla: screen.width }))
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
