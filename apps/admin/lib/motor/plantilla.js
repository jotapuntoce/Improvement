// La plantilla del Chequeo: el diseño es fijo y la IA solo llena el texto (escapado). Parte de
// Improvement/jotapuntoce/chequeos/chequeo-boreal.html y del manual de marca v1 (monograma M2, Inter Tight, Bricolage,
// hilo de 6 colores). Las 4 portadas cambian según la etapa del prospecto; sus bocetos los aprueba el dueño
// (app/chequeos/muestra) antes de encender el motor.
import { readFileSync } from "node:fs";
import path from "node:path";

// ponytail: lee los archivos relativos a apps/admin (cwd de next y de vitest); al publicar el admin, revisar que el
// hosting conserve el monorepo o copiarlos al build.
const leer = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");
let recursos;
const losRecursos = () =>
  (recursos ??= {
    tokens: leer("../../packages/ui/src/tokens.css"),
    monograma: `data:image/svg+xml;base64,${Buffer.from(leer("public/brand/monograma-m2-marino.svg")).toString("base64")}`,
  });

const e = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const linea = (d) =>
  `<svg viewBox="0 0 170 90" class="trazo" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}" style="stroke:var(--brand-navy)" stroke-width=".7"/></svg>`;

// Flecha a mano que sube de la frase al boceto (decisión del dueño, 2026-10-05).
const FLECHA = `<svg viewBox="0 0 20 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="stroke:var(--brand-amber-paper)" stroke-width="1.4"><path d="M11 22 C6 16 13 10 9 3 M9 3 l-4 4 M9 3 l3 5"/></svg>`;

// Íconos de línea para las cifras de "Primero, lo bueno" (la IA elige el nombre; esquema.js, ICONOS_KPI).
const ICONOS = {
  estrella: "M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z",
  calendario: "M4.5 6.5h15v13h-15z M4.5 10.5h15 M8.5 4v4 M15.5 4v4",
  comunidad: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5 M16 11a2.5 2.5 0 1 0 0-5 M17 14c2 .4 3.2 2 3.5 5",
  corazon: "M12 19.5s-7.5-4.6-7.5-10A4 4 0 0 1 12 7.2a4 4 0 0 1 7.5 2.3c0 5.4-7.5 10-7.5 10z",
  crecimiento: "M4 17l5.5-5.5 3.5 3.5 7-7 M14.5 8H20v5.5",
  lugar: "M12 20.5s6-5.6 6-10.5a6 6 0 0 0-12 0c0 4.9 6 10.5 6 10.5z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  trofeo: "M7.5 4.5h9v4a4.5 4.5 0 0 1-9 0z M7.5 6.5H4.5c0 2.5 1.3 4 3.3 4.3 M16.5 6.5h3c0 2.5-1.3 4-3.3 4.3 M12 13v3.5 M8.5 19.5h7 M10 16.5h4v3h-4z",
  mensaje: "M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z",
};
const icono = (n) =>
  ICONOS[n]
    ? `<i class="ico"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" aria-hidden="true"><path d="${ICONOS[n]}"/></svg></i>`
    : "";
const ESTRELLA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS.estrella}"/></svg>`;
// "Valentina Gaytan" → "Valentina G.": su nombre de pila, nunca el apellido completo.
const autorCorto = (a) => {
  const [n = "", ap] = String(a).trim().split(/\s+/).filter((p, i) => i === 0 || !/^(de|del|la|las|los|y)$/i.test(p));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return ap ? `${cap(n)} ${ap[0].toUpperCase()}.` : cap(n);
};

/** Una portada por etapa: la frase a mano (va abajo del boceto, señalándolo) y el trazo de la ilustración. */
export const PORTADAS = {
  idea: { frase: "puede ser a lo que te dediques toda la vida.", trazo: linea("M20 70 C40 70 50 40 85 40 C120 40 130 20 150 18 M150 18 l-6 -2 M150 18 l-3 5") },
  arrancando: { frase: "ya está dando sus primeros pasos.", trazo: linea("M10 70 H50 L60 60 H90 L100 50 H130 L140 40 H165") },
  creciendo: { frase: "da para más.", trazo: linea("M0 62 H34 L38 56 L42 62 H50 L54 70 L59 30 L64 72 L68 62 H102 L114 54 L124 57 L136 40 L148 43 L166 16") },
  consolidado: { frase: "está listo para el siguiente piso.", trazo: linea("M30 80 V40 H70 V80 M70 80 V25 H110 V80 M110 80 V10 H150 V80 M20 80 H160") },
};

const ESTILOS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "Inter Tight", system-ui, sans-serif; color: var(--brand-navy); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; background: var(--brand-ivory); position: relative; overflow: hidden; padding: 18mm 20mm 24mm; display: flex; flex-direction: column; page-break-after: always; }
  .head { display: flex; justify-content: space-between; align-items: center; font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: color-mix(in srgb, var(--brand-navy) 72%, var(--brand-ivory)); }
  .head img { height: 9mm; }
  .foot { position: absolute; left: 20mm; right: 20mm; bottom: 12mm; display: flex; justify-content: space-between; font-size: 8pt; color: color-mix(in srgb, var(--brand-navy) 72%, var(--brand-ivory)); }
  .foot::before { content: ""; position: absolute; left: 0; right: 0; top: -4mm; height: .6mm; border-radius: 1mm; background: var(--brand-thread); }
  .trazo { width: 100%; margin-top: 14mm; }
  .senal { text-align: center; font-size: 15pt; margin-top: -8mm; }
  .senal svg { display: block; width: 10mm; height: 12mm; margin: 0 auto 1mm; }
  .senal .hand { font-size: 1.5em; }
  .cover .block { margin-top: auto; background: var(--dept-imaginacion); border-radius: 4mm; padding: 14mm 12mm; }
  .cover h1 { font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 46pt; line-height: .92; letter-spacing: -.045em; }
  .cover .for { margin-top: 6mm; font-size: 12.5pt; line-height: 1.4; }
  .cover .meta { margin: 10mm 0 8mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; font-size: 9.5pt; }
  .cover .meta b { display: block; font-weight: 600; font-size: 10.5pt; }
  h2 { font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 26pt; line-height: .95; letter-spacing: -.04em; margin: 12mm 0 6mm; }
  .hand { font-family: Caveat; font-weight: 700; color: var(--brand-amber-paper); font-size: 1.18em; }
  p, li { font-size: 10.3pt; line-height: 1.55; }
  p + p { margin-top: 3mm; }
  ul { padding-left: 5mm; }
  li + li { margin-top: 2mm; }
  h3 { font-size: 11.5pt; font-weight: 600; margin: 0 0 1.5mm; }
  .card { position: relative; border: .3mm solid color-mix(in srgb, var(--brand-navy) 18%, transparent); border-radius: 3mm; padding: 3.2mm 5mm; }
  .card h3 { padding-right: 26mm; }
  .card + .card { margin-top: 2.6mm; }
  .tag { display: inline-block; font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase; border: .3mm solid color-mix(in srgb, var(--brand-navy) 25%, transparent); border-radius: 10mm; padding: .6mm 2.4mm; position: absolute; top: 3.2mm; right: 5mm; }
  .pill { background: var(--brand-navy); color: var(--brand-ivory); border-radius: 3mm; padding: 4.5mm 5mm; }
  .pill + .pill { margin-top: 3mm; }
  .yellow { background: var(--dept-imaginacion); border-radius: 4mm; padding: 10mm; margin-top: auto; margin-bottom: 4mm; }
  .yellow h2 { margin-top: 0; }
  .lead { font-size: 14pt; font-weight: 400; letter-spacing: -.02em; line-height: 1.32; margin-bottom: 7mm; }
  .cols { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 7mm; }
  .kpi { border-top: .4mm solid var(--brand-navy); padding-top: 3mm; }
  .kpi .ico { display: flex; align-items: center; justify-content: center; width: 10mm; height: 10mm; border-radius: 50%; margin-bottom: 2mm; background: color-mix(in srgb, var(--brand-amber) 22%, transparent); }
  .kpi .ico svg { width: 5.6mm; height: 5.6mm; stroke: var(--brand-navy); }
  .patron { margin-top: 7mm; padding: 4mm 5mm; border-left: 1mm solid var(--brand-amber); background: color-mix(in srgb, var(--brand-amber) 9%, transparent); border-radius: 0 3mm 3mm 0; }
  .ops { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-top: 2mm; }
  .op { background: var(--brand-navy); color: var(--brand-ivory); border-radius: 3mm; padding: 4mm 4.5mm; display: flex; flex-direction: column; gap: 2mm; }
  .op .stars svg { width: 3.4mm; height: 3.4mm; fill: var(--brand-amber); margin-right: .4mm; }
  .op q { font-size: 10pt; line-height: 1.4; }
  .op span { font-size: 8.4pt; margin-top: auto; color: color-mix(in srgb, var(--brand-ivory) 75%, var(--brand-navy)); }
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
`;

const mes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });
const dia = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

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
    xs.length ? `<div class="cols">${xs.map((f) => `<div class="kpi">${icono(f.icono)}<b>${e(f.valor)}</b><span>${e(f.texto)}</span></div>`).join("")}</div>` : "";
  const barras = (cx) => {
    const max = Math.max(1, ...cx.items.map((i) => i.valor));
    return `<h3 style="margin-top:9mm">${e(cx.titulo)}</h3><div class="bars">${cx.items
      .map((i) => `<div class="bar"><span>${e(i.que)}</span><i style="width:${Math.round((i.valor / max) * 100)}%"></i><em>${Number(i.valor)}</em></div>`)
      .join("")}</div>`;
  };
  // Con la gráfica de Instagram en la misma hoja, solo caben 2 opiniones.
  const opinionesDe = (o, caben) =>
    o
      ? `<h3 style="margin-top:8mm">${e(o.titulo)}</h3><div class="ops">${o.items
          .slice(0, caben)
          .map((x) => `<div class="op"><div class="stars">${ESTRELLA.repeat(x.estrellas)}</div><q>${e(x.texto)}</q><span>${e(autorCorto(x.autor))} · en Google</span></div>`)
          .join("")}</div>`
      : "";
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
        `<h2>Primero, lo bueno</h2>${guiaDe(b.guia)}${kpis(b.felicitacion)}${b.conecta ? barras(b.conecta) : ""}<p class="patron">${e(b.patron)}</p>${opinionesDe(b.opiniones, b.conecta ? 2 : 4)}`,
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
        `<h2>Lo que ${k.trato === "ustedes" ? "pueden" : "puedes"} hacer desde mañana</h2>${guiaDe(r.guia)}${acciones(r.items)}${r.dimensionar ? `<p class="note">Para dimensionar: ${e(r.dimensionar.texto)} <i>(supuesto: ${e(r.dimensionar.supuesto)})</i></p>` : ""}`,
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
