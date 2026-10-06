// Recolector del sitio: lo recorre como un cliente en Chromium (el mismo del PDF). Sin IA: lo que se puede medir se
// mide. Spec 2026-10-05-chequeo-como-el-primero-design.md, sección 3.
import { chromium } from "playwright-core";

const PENDIENTES =
  /muy pronto|pr[oó]ximamente|en construcci[oó]n|pregunta en recepci[oó]n|ac[eé]rcate (?:directamente )?a recepci[oó]n|coming soon/gi;
const PRECIO = /\$\s?\d[\d,]*(?:\.\d+)?/g;
const MAX_PAGINAS = 12;
const TEXTO_MAX = 2500;
const PLAZO_MS = 60_000;
// Textos de enlace que sí deben llevar al inicio: vacío, "logo", "inicio", "home", "página principal".
const VAN_AL_INICIO = /^$|logo|inicio|home|p[aá]gina principal/i;
const NO_HTML = /.(pdf|jpe?g|png|webp|gif|zip|docx?|xlsx?|mp4)$/i;
const BLOQUEO = [401, 403, 429]; // la página existe, solo rechazó al robot

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

    // Solo el href crudo exactamente igual al inicio: sin ancla, sin query, y que no sea el logo/nombre del sitio.
    const nombreSitio = (await page.title()).toLowerCase();
    const esInicioPuro = (h) => {
      if (h.includes("#") || h.includes("?")) return false;
      const x = new URL(h);
      return x.origin === origen && (x.pathname === "/" || x.pathname === "");
    };
    const regresanAlInicio = enlaces
      .filter((a) => esInicioPuro(a.href) && !VAN_AL_INICIO.test(a.texto) && !(nombreSitio && nombreSitio.includes(a.texto.toLowerCase())))
      .map((a) => ({ texto: a.texto, href: a.href }));

    const internas = unicos(enlaces.map((a) => limpia(a.href)).filter((h) => h.startsWith(origen) && h !== inicio)).slice(0, MAX_PAGINAS);
    const paginas = [];
    const enlacesRotos = [];
    const bloqueados = [];
    for (const destino of [inicio, ...internas]) {
      if (Date.now() > plazo) break; // ponytail: plazo total fijo; sitios lentos quedan a medias, sin fallar
      const enlace = enlaces.find((x) => limpia(x.href) === destino);
      if (NO_HTML.test(destino)) {
        // fetch desde la página (mismo origen): pasa por ctx.route en pruebas; ctx.request lo saltaría.
        const st = await page.evaluate((u) => fetch(u).then((x) => x.status), destino).catch(() => 0);
        if (st === 0 || st >= 400) enlacesRotos.push({ texto: enlace?.texto ?? "", href: enlace?.href ?? destino, status: st });
        continue;
      }
      const resp = await page.goto(destino, { waitUntil: "load" }).catch(() => null);
      const status = resp?.status() ?? 0;
      if (BLOQUEO.includes(status)) {
        bloqueados.push({ href: destino, status });
        continue;
      }
      if (!resp || status >= 400) {
        enlacesRotos.push({ texto: enlace?.texto ?? "", href: enlace?.href ?? destino, status });
        continue;
      }
      const texto = (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").trim();
      paginas.push({
        url: destino,
        titulo: await page.title(),
        status,
        texto: texto.slice(0, TEXTO_MAX),
        precios: unicos(texto.match(PRECIO) ?? []).map((p) => p.replace(/\s/g, "")),
        pendientes: (texto.match(PENDIENTES) ?? []).filter((p, i, xs) => xs.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i),
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
      data: {
        url: inicio,
        paginas,
        enlacesRotos,
        bloqueados,
        regresanAlInicio,
        celular: { ...celular, medido: celular.anchoPagina > 0, seSaleDeLado: celular.anchoPagina > celular.anchoPantalla + 2 },
      },
    };
  } catch (e) {
    return { ok: false, motivo: `No se pudo recorrer el sitio: ${e?.message ?? e}` };
  } finally {
    await navegador?.close().catch(() => {});
  }
}
