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
  .card { border: .3mm solid color-mix(in srgb, var(--brand-navy) 18%, transparent); border-radius: 3mm; padding: 3.2mm 5mm; }
  .card + .card { margin-top: 2.6mm; }
  .tag { display: inline-block; font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase; border: .3mm solid color-mix(in srgb, var(--brand-navy) 25%, transparent); border-radius: 10mm; padding: .6mm 2.4mm; margin-left: 2mm; }
  .pill { background: var(--brand-navy); color: var(--brand-ivory); border-radius: 3mm; padding: 4.5mm 5mm; }
  .pill + .pill { margin-top: 3mm; }
  .yellow { background: var(--dept-imaginacion); border-radius: 4mm; padding: 10mm; margin-top: auto; margin-bottom: 4mm; }
  .yellow h2 { margin-top: 0; }
`;

const mes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });
const dia = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

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
  const lista = (xs) => `<ul>${xs.map((x) => `<li>${e(x)}</li>`).join("")}</ul>`;
  const acciones = (xs) => xs.map((a, i) => `<div class="pill"><h3>${i + 1}. ${e(a.titulo)}</h3><p>${e(a.como)}</p></div>`).join("");

  const paginas = [
    pagina(
      `Chequeo · ${mes.format(fecha)}`,
      `${portada.trazo}<p class="senal">${FLECHA}${e(c.tipo === "negocio" ? c.negocio : "Tu idea")} <span class="hand">${e(portada.frase)}</span></p><div class="block"><h1>Chequeo de ${e(nombre)}</h1><div class="for">Preparado para <b>${e(para)}</b><br>${e(k.portada.dedicatoria)}</div></div><div class="meta"><div><b>Jose Carlos Salinas</b>Preparado por</div><div><b>${dia.format(fecha)}</b>Fecha</div><div><b>Un regalo</b>No cuesta nada</div></div>`,
    ).replace('class="page"', 'class="page cover"'),
    pagina("Antes de empezar", `<h2>Por qué hicimos esto</h2><p>${e(k.porQue)}</p><div class="card" style="margin-top:8mm"><p>${e(k.portada.dedicatoria)}</p></div><p style="margin-top:6mm"><span class="hand">Con gusto,</span></p><p><b>Jose Carlos Salinas</b> · JotaPuntoCe</p>`),
  ];

  if (k.tipo === "negocio") {
    paginas.push(
      pagina("Lo que ya funciona", `<h2>Primero, lo bueno</h2>${lista(k.bueno)}`),
      pagina(
        "Lo que se ve desde afuera",
        `<h2>Lo que se ve desde afuera</h2>${k.patogenos
          .map(
            (p) =>
              `<div class="card"><h3>${e(p.titulo)}<span class="tag">${p.marca === "dato" ? "Dato" : "Estimación"}</span></h3><p>${e(p.evidencia)}</p><p><b>Lo que cuesta:</b> ${e(p.costo)}${p.supuesto ? ` <i>(supuesto: ${e(p.supuesto)})</i>` : ""}</p></div>`,
          )
          .join("")}`,
      ),
      pagina("Desde mañana", `<h2>Lo que pueden hacer desde mañana</h2>${acciones(k.pastillas)}`),
      pagina("Lo que sigue", `<h2>La parte que no se ve</h2><p>${e(k.noSeVe)}</p><div class="yellow"><h2>¿Lo platicamos?</h2><p>${e(k.cierre)}</p></div>`),
    );
  } else {
    paginas.push(
      pagina("Lo que te mueve", `<h2>Lo que te mueve</h2>${lista(k.bueno)}`),
      pagina(
        "Tu idea",
        `<h2>Tu idea</h2><p class="hand" style="font-size:18pt">${k.idea.viable ? "Sí tiene con qué." : "Todavía le falta."}</p><p>${e(k.idea.porque)}</p><h3 style="margin-top:6mm">Lo que le falta</h3>${lista(k.idea.leFalta)}`,
      ),
      pagina("Tus primeros pasos", `<h2>Tus primeros pasos</h2>${acciones(k.pasos)}`),
      pagina("Lo que sigue", `<h2>El siguiente nivel</h2><p>${e(k.siguienteNivel)}</p><div class="yellow"><h2>¿Lo platicamos?</h2><p>${e(k.cierre)}</p></div>`),
    );
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Chequeo de ${e(nombre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Caveat:wght@700&family=Inter+Tight:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${tokens}${ESTILOS}</style></head><body>${paginas.join("")}</body></html>`;
}
