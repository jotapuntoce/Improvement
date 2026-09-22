// El plano de la recepción, revisado con números en vez de a ojo.
//
// Dos cosas se rompieron mirando la pantalla y no se notaron: un mueble encimado sobre otro (el de
// abajo pierde el texto y el clic se lo lleva el de encima) y un mueble colgado fuera de la pared
// de madera, sobre el ventanal. Aquí se revisan a la primera.
//
// Los muebles son FIJOS: no cambian de tamaño con los datos. Lo que sí hay que comprobar es que
// cada uno alcance para su contenido lleno — si alguien sube MAX_PROYECTOS o MAX_RETRATOS sin
// agrandar el mueble, el contenido se cortaría en silencio y eso ya pasó una vez.
import { describe, expect, it } from "vitest";
import {
  ALCANCE,
  type Caja,
  GLOBO,
  type LobbyZona,
  MARCOS,
  MAX_PROYECTOS,
  MAX_RETRATOS,
  PARED,
  TAPA_Y,
  ZONAS,
  altoDePantalla,
  anchoDeMuro,
  conMarco,
} from "@jotapuntoce/ui/building/lobbyPlano.ts";

function seEnciman(a: Caja, b: Caja): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Cada mueble con el marco que el SVG le dibuja alrededor, más las dos cosas que no son muebles
 * pero igual ocupan pared: el globo de quien atiende y la placa de alcance del mostrador.
 */
const MUEBLES: [string, Caja][] = [
  ...(Object.keys(ZONAS) as LobbyZona[]).map(
    (k) => [k, conMarco(ZONAS[k], MARCOS[k])] as [string, Caja],
  ),
  ["globo", GLOBO],
  ["alcance", ALCANCE],
];

describe("el plano de la recepción", () => {
  it("ningún mueble se sale de la pared de madera", () => {
    for (const [nombre, caja] of MUEBLES) {
      expect(caja.x, `${nombre}: se sale por la izquierda`).toBeGreaterThanOrEqual(PARED.x0);
      expect(caja.x + caja.w, `${nombre}: se sale por la derecha`).toBeLessThanOrEqual(PARED.x1);
      expect(caja.y, `${nombre}: se sale por arriba`).toBeGreaterThanOrEqual(PARED.y0);
      expect(caja.y + caja.h, `${nombre}: se sale por abajo`).toBeLessThanOrEqual(PARED.y1);
    }
  });

  it("ningún mueble se encima con otro", () => {
    for (let i = 0; i < MUEBLES.length; i++) {
      for (let j = i + 1; j < MUEBLES.length; j++) {
        const a = MUEBLES[i]!;
        const b = MUEBLES[j]!;
        expect(seEnciman(a[1], b[1]), `${a[0]} y ${b[0]} se enciman`).toBe(false);
      }
    }
  });

  it("cada mueble alcanza para su contenido lleno", () => {
    expect(
      ZONAS.proyectos.h,
      `la pantalla no alcanza para ${MAX_PROYECTOS} proyectos`,
    ).toBeGreaterThanOrEqual(altoDePantalla(MAX_PROYECTOS));
    expect(
      ZONAS.equipo.w,
      `el muro no alcanza para ${MAX_RETRATOS} retratos`,
    ).toBeGreaterThanOrEqual(anchoDeMuro(MAX_RETRATOS));
  });

  it("la pantalla y el letrero se apoyan en el mostrador, no flotan", () => {
    expect(ZONAS.proyectos.y + ZONAS.proyectos.h).toBe(410);
    expect(ZONAS.clientes.y + ZONAS.clientes.h).toBeLessThan(TAPA_Y);
  });

  it("el muro y el lector comparten orilla derecha, y el pizarrón y la pantalla la izquierda", () => {
    expect(ZONAS.equipo.x + ZONAS.equipo.w).toBe(ZONAS.powerups.x + ZONAS.powerups.w);
    expect(ZONAS.proyectos.x).toBeLessThanOrEqual(ZONAS.objetivos.x);
  });

  it("el lector queda a la misma distancia del muro que del mostrador", () => {
    const muro = conMarco(ZONAS.equipo, MARCOS.equipo);
    const lector = conMarco(ZONAS.powerups, MARCOS.powerups);
    const arriba = lector.y - (muro.y + muro.h);
    const abajo = TAPA_Y - (lector.y + lector.h);
    expect(Math.abs(arriba - abajo), `${arriba} arriba y ${abajo} abajo`).toBeLessThanOrEqual(1);
    expect(abajo, "el lector no puede quedar pegado al mostrador").toBeGreaterThan(8);
  });
});
