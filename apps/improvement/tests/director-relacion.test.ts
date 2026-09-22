// La personalidad del Director, en lo que se puede comprobar.
//
// Una personalidad escrita solo en el prompt es una intención: nadie sabe si sigue ahí tres
// refactors después. Lo que esta suite cuida son las partes que SÍ son verificables:
//
//  1. La relación se deriva de vueltas reales. Si `loadRelacion` empezara a inventar historia,
//     el Director sonaría a alguien que te conoce sin conocerte, que es peor que ser nuevo.
//  2. En la primera vuelta NO finge que se conocen. El bloque sale vacío, a propósito.
//  3. La convicción es obligatoria y calibrable. Sin eso, "tengo opiniones" es decoración.
//  4. El prompt conserva las prohibiciones de voz. Son la diferencia entre este Director y un
//     asistente genérico, y son exactamente lo que se pierde primero al editar un prompt largo.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { improvementCycle, membership, organization, profile } from "@jotapuntoce/db/schema";
import {
  CONVICTION_LABEL,
  CONVICTION_LEVELS,
  DIRECTOR_PERSONA,
  directorSuggestionSchema,
} from "../server/ai/prompts/director.ts";
import {
  RELACION_VACIA,
  loadRelacion,
  relacionEnPalabras,
} from "../server/improvement/relacion.ts";

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(sql`${profile.id} = ${userId}`);
  }
});

async function empresaConDueno(nombre: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: nombre, slug: `${nombre.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);

  const ownerId = crypto.randomUUID();
  await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
  createdProfileIds.push(ownerId);
  await db
    .insert(membership)
    .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

  return { org, ownerId };
}

/** Una vuelta ya cerrada, con todo lo que la relación lee. */
function vuelta(
  orgId: string,
  ownerId: string,
  x: {
    title: string;
    causeCategory?: string;
    rootCause?: string;
    conviction?: string;
    ownerDecision?: string;
    ownerFeedback?: string;
    result?: string;
    diasAtras: number;
  },
) {
  return {
    orgId,
    ownerId,
    title: x.title,
    phase: "cerrado",
    rootCause: x.rootCause ?? null,
    causeCategory: x.causeCategory ?? null,
    conviction: x.conviction ?? null,
    ownerDecision: x.ownerDecision ?? null,
    ownerFeedback: x.ownerFeedback ?? null,
    result: x.result ?? null,
    closedAt: new Date(Date.now() - x.diasAtras * 86_400_000),
  };
}

describe("la relación", () => {
  it("WHEN no hay vueltas cerradas THE SYSTEM SHALL no inventar una historia", async () => {
    // El día uno el Director es nuevo, y tiene que sonar nuevo. Fingir que llevan tiempo juntos
    // es el error más caro de esta función: se nota, y una vez que se nota ya no le crees nada.
    const { org } = await empresaConDueno("Relacion Nueva");

    const r = await loadRelacion(org.id);

    expect(r).toEqual(RELACION_VACIA);
    expect(relacionEnPalabras(r)).toBe("");
  });

  it("WHEN la empresa tropieza siempre con lo mismo THE SYSTEM SHALL contarlo como patrón", async () => {
    const { org, ownerId } = await empresaConDueno("Relacion Patron");
    await db.insert(improvementCycle).values([
      vuelta(org.id, ownerId, { title: "A", causeCategory: "metodos", diasAtras: 30 }),
      vuelta(org.id, ownerId, { title: "B", causeCategory: "metodos", diasAtras: 20 }),
      vuelta(org.id, ownerId, { title: "C", causeCategory: "medicion", diasAtras: 10 }),
    ]);

    const r = await loadRelacion(org.id);

    expect(r.vueltas).toBe(3);
    expect(r.patron[0]).toEqual({ categoria: "Métodos", veces: 2 });
    expect(relacionEnPalabras(r)).toContain("Métodos 2");
  });

  it("WHEN el dueño rechazó una causa THE SYSTEM SHALL recordarla con su motivo", async () => {
    const { org, ownerId } = await empresaConDueno("Relacion Rechazo");
    await db.insert(improvementCycle).values([
      vuelta(org.id, ownerId, {
        title: "Entregas",
        rootCause: "No hay punto de reposición definido",
        ownerDecision: "rechazo",
        ownerFeedback: "Ahorita no hay dinero para eso",
        diasAtras: 15,
      }),
    ]);

    const texto = relacionEnPalabras(await loadRelacion(org.id));

    expect(texto).toContain("No hay punto de reposición definido");
    expect(texto).toContain("Ahorita no hay dinero");
    expect(texto).toContain("No las vuelvas a proponer igual");
  });

  it("WHEN propuso algo que se aceptó y falló THE SYSTEM SHALL contarlo como error suyo", async () => {
    // Que reconozca sus propios errores es la mitad de tener criterio. La otra mitad —no
    // sacarlo a relucir cada vez— la pone el prompt, y se verifica abajo.
    const { org, ownerId } = await empresaConDueno("Relacion Error");
    await db.insert(improvementCycle).values([
      vuelta(org.id, ownerId, {
        title: "Checklist digital",
        ownerDecision: "acepto",
        result: "fallido",
        conviction: "alta",
        diasAtras: 40,
      }),
    ]);

    const r = await loadRelacion(org.id);
    const texto = relacionEnPalabras(r);

    expect(r.falloMio).toHaveLength(1);
    expect(texto).toContain("Donde te equivocaste tú");
    expect(texto).toContain("Checklist digital");
    expect(texto).toContain("sin disculparte de más");
  });

  it("WHEN su convicción alta no acierta THE SYSTEM SHALL decirle que la está sobrevendiendo", async () => {
    const { org, ownerId } = await empresaConDueno("Relacion Calibra");
    await db.insert(improvementCycle).values([
      vuelta(org.id, ownerId, { title: "1", conviction: "alta", ownerDecision: "acepto", result: "fallido", diasAtras: 30 }),
      vuelta(org.id, ownerId, { title: "2", conviction: "alta", ownerDecision: "acepto", result: "fallido", diasAtras: 20 }),
      vuelta(org.id, ownerId, { title: "3", conviction: "alta", ownerDecision: "acepto", result: "exitoso", diasAtras: 10 }),
    ]);

    const r = await loadRelacion(org.id);
    const texto = relacionEnPalabras(r);

    expect(r.calibracion).toContainEqual({ conviccion: "alta", dijo: 3, acerto: 1 });
    expect(texto).toContain("sobrevendiendo");
  });

  it("WHEN una propuesta fue rechazada THE SYSTEM SHALL no contarla contra su calibración", async () => {
    // Si una propuesta rechazada contara como fallo, el Director aprendería a proponer lo que se
    // acepta fácil en vez de lo que cree. Es el incentivo exactamente al revés.
    const { org, ownerId } = await empresaConDueno("Relacion Calibra Justa");
    await db.insert(improvementCycle).values([
      vuelta(org.id, ownerId, { title: "1", conviction: "alta", ownerDecision: "rechazo", diasAtras: 10 }),
    ]);

    const r = await loadRelacion(org.id);

    expect(r.calibracion).toHaveLength(0);
  });

  it("WHEN encadena resultados THE SYSTEM SHALL saber en qué racha va", async () => {
    const { org, ownerId } = await empresaConDueno("Relacion Racha");
    await db.insert(improvementCycle).values([
      vuelta(org.id, ownerId, { title: "1", result: "exitoso", diasAtras: 5 }),
      vuelta(org.id, ownerId, { title: "2", result: "exitoso", diasAtras: 10 }),
      vuelta(org.id, ownerId, { title: "3", result: "exitoso", diasAtras: 15 }),
      vuelta(org.id, ownerId, { title: "4", result: "fallido", diasAtras: 20 }),
    ]);

    const r = await loadRelacion(org.id);

    expect(r.racha).toBe(3);
    expect(relacionEnPalabras(r)).toContain("no te pongas a recetar");
  });

  it("WHEN una empresa mira su relación THE SYSTEM SHALL no incluir vueltas de otra", async () => {
    const a = await empresaConDueno("Relacion Aislada A");
    const b = await empresaConDueno("Relacion Aislada B");
    await db.insert(improvementCycle).values([
      vuelta(a.org.id, a.ownerId, { title: "de A", causeCategory: "metodos", diasAtras: 5 }),
      vuelta(b.org.id, b.ownerId, { title: "de B", causeCategory: "maquinas", diasAtras: 5 }),
    ]);

    const r = await loadRelacion(a.org.id);

    expect(r.vueltas).toBe(1);
    expect(r.patron[0]?.categoria).toBe("Métodos");
  });
});

describe("la convicción", () => {
  it("WHEN una propuesta no declara convicción THE SYSTEM SHALL rechazarla", () => {
    const sin = directorSuggestionSchema.safeParse({
      suggestion: "Pon un punto de reposición al cierre de turno.",
      siMeDicesQueNo: "Esto vuelve en tres semanas.",
      tasks: [],
    });
    expect(sin.success).toBe(false);
  });

  it("WHEN no dice qué pasa si le dicen que no THE SYSTEM SHALL rechazarla", () => {
    // Es el hueco de "no sostiene sus opiniones" hecho contrato: sin este campo, un 'no' cerraba
    // la vuelta y el Director no dejaba constancia de nada.
    const sin = directorSuggestionSchema.safeParse({
      suggestion: "Pon un punto de reposición al cierre de turno.",
      conviccion: "alta",
      tasks: [],
    });
    expect(sin.success).toBe(false);
  });

  it("WHEN inventa un nivel de convicción THE SYSTEM SHALL rechazarlo", () => {
    const malo = directorSuggestionSchema.safeParse({
      suggestion: "Algo",
      conviccion: "altísima",
      siMeDicesQueNo: "Vuelve",
      tasks: [],
    });
    expect(malo.success).toBe(false);
  });

  it("WHEN el catálogo crece THE SYSTEM SHALL tener etiqueta para cada nivel", () => {
    // Los tres niveles viven en tres lugares: este enum, el check de la base y la etiqueta que ve
    // el dueño. Esta prueba amarra dos de los tres; el check es la última palabra.
    for (const nivel of CONVICTION_LEVELS) {
      expect(CONVICTION_LABEL[nivel], `${nivel} sin etiqueta`).toBeTruthy();
    }
  });
});

describe("la voz", () => {
  it("WHEN se edita el prompt THE SYSTEM SHALL conservar lo que NUNCA dice", () => {
    // Estas prohibiciones son lo que separa a este Director de un asistente genérico, y son lo
    // primero que se cae cuando alguien reescribe un prompt largo sin darse cuenta.
    for (const prohibido of ["¡Excelente pregunta!", "Es importante destacar", "Sin emojis"]) {
      expect(DIRECTOR_PERSONA, `se perdió: ${prohibido}`).toContain(prohibido);
    }
  });

  it("WHEN se edita el prompt THE SYSTEM SHALL conservar sus cuatro costumbres", () => {
    for (const habito of [
      "lo que cuesta NO hacer algo",
      "por semana o por mes",
      "qué se rompería si se duplicara",
      "el peor caso",
    ]) {
      expect(DIRECTOR_PERSONA, `se perdió el hábito: ${habito}`).toContain(habito);
    }
  });

  it("WHEN se edita el prompt THE SYSTEM SHALL conservar la proporción emocional", () => {
    expect(DIRECTOR_PERSONA).toContain("UNA línea");
    expect(DIRECTOR_PERSONA).toContain("no haces terapia");
    // Lo personal se registra como personal ANTES de volverse un problema de proceso.
    expect(DIRECTOR_PERSONA).toContain("dejen de contarte cosas");
  });

  it("WHEN el dueño dice que no THE SYSTEM SHALL acatar sin dejar de opinar", () => {
    expect(DIRECTOR_PERSONA).toContain("ACATAS");
    expect(DIRECTOR_PERSONA).toContain("UNA vez");
    // Y la regla que evita que sostener una opinión se vuelva cobrársela.
    expect(DIRECTOR_PERSONA).toContain("sin cobrártela");
  });

  it("WHEN sabe cómo piensa el dueño THE SYSTEM SHALL usarlo para entregar, no de adorno", () => {
    expect(DIRECTOR_PERSONA).toContain("NO es decoración");
    expect(DIRECTOR_PERSONA).toContain("es literal, no una metáfora");
  });
});
