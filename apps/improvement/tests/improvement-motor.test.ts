// El motor de las siete fases, corriendo de verdad contra la base y contra un proveedor simulado.
//
// El proveedor se inyecta (SuggestionProvider), igual que en tests/ai-gateway.test.ts: ninguna de
// estas pruebas toca la red ni gasta una API key. Lo que sí es real es Postgres — las
// transiciones, el condicionado a la fase anterior y el aislamiento entre empresas solo se pueden
// comprobar contra la base, porque es la base la que los sostiene.
//
// Las tres cosas que esta suite cuida, en orden de importancia:
//
//  1. De `sugerencia` NO se sale solo. Es la regla que sostiene el producto entero.
//  2. Una empresa no ve el ciclo de otra, ni con un id válido en la mano.
//  3. Una fase que falla no avanza el ciclo — se queda donde estaba y se reintenta.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  area,
  delegatedTask,
  objective,
  project,
  projectTask,
  improvementCycle,
  improvementEvent,
  membership,
  organization,
  ownerMessage,
  profile,
} from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { listConversation } from "../server/improvement/chat.ts";
import {
  countMyOpenObjectives,
  listMyObjectives,
} from "../server/objectives/mutations.ts";
import {
  countMyOpenProjectTasks,
  listMyProjectTasks,
} from "../server/erp/projects.ts";
import {
  countMyOpenDelegations,
  elegirResponsable,
  listMyDelegatedTasks,
  respondToTask,
} from "../server/improvement/delegation.ts";
import { advanceCycle } from "../server/improvement/phases.ts";
import {
  activeCycle,
  closeCycle,
  decideCycle,
  startCycle,
} from "../server/improvement/motor.ts";

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

/** Un proveedor que contesta lo que se le diga, y cuenta cuántas veces lo llamaron. */
function proveedorFalso(respuestas: Record<string, unknown>): SuggestionProvider & { llamadas: number } {
  const p = {
    llamadas: 0,
    async complete(_system: string, prompt: string): Promise<SuggestionCompletion> {
      p.llamadas++;
      // Qué fase se está pidiendo se reconoce por la instrucción, que es lo único que cambia
      // entre un prompt y otro (ver INSTRUCCION en prompts/director.ts).
      const fase = Object.keys(respuestas).find((f) => prompt.includes(MARCA[f] ?? f));
      return {
        text: JSON.stringify(fase ? respuestas[fase] : {}),
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        finishReason: "end_turn",
      };
    },
  };
  return p;
}

/** La palabra por la que se reconoce cada fase dentro del prompt. */
const MARCA: Record<string, string> = {
  observacion: "FASE 1 —",
  inferencia: "FASE 2 —",
  analisis: "FASE 3 —",
  sugerencia: "FASE 4 —",
  medicion: "FASE 7 —",
};

/** Un proveedor que siempre devuelve basura: sirve para probar que una fase que falla no avanza. */
const proveedorRoto: SuggestionProvider = {
  async complete(): Promise<SuggestionCompletion> {
    return {
      text: "no soy json",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      finishReason: "end_turn",
    };
  },
};

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

async function cicloDe(orgId: string): Promise<typeof improvementCycle.$inferSelect> {
  const [row] = await db
    .select()
    .from(improvementCycle)
    .where(eq(improvementCycle.orgId, orgId))
    .limit(1);
  if (!row) throw new Error("no hay ciclo");
  return row;
}

describe("abrir una vuelta", () => {
  it("WHEN el dueño abre una vuelta THE SYSTEM SHALL empezarla en observación y dejar constancia", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Abrir");

    const r = await startCycle(ownerId, org.id, { title: "Las entregas van tarde" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.phase).toBe("observacion");

    const eventos = await db
      .select()
      .from(improvementEvent)
      .where(eq(improvementEvent.cycleId, r.data.id));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.triggeredBy).toBe("dueno");
  });

  it("WHEN ya hay una vuelta viva THE SYSTEM SHALL negarse a abrir otra", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Una Sola");
    await startCycle(ownerId, org.id, { title: "Primera" });

    const segunda = await startCycle(ownerId, org.id, { title: "Segunda" });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe("CONFLICT");
  });

  it(
    "WHEN quien pide abrir una vuelta no es el dueño THE SYSTEM SHALL negarse — Improvement " +
      "dirige con el dueño, no con quien tenga sesión",
    async () => {
      const { org } = await empresaConDueno("Motor Solo Dueno");
      const empleadoId = crypto.randomUUID();
      await db.insert(profile).values({ id: empleadoId, email: `${empleadoId}@example.com` });
      createdProfileIds.push(empleadoId);
      await db
        .insert(membership)
        .values({ userId: empleadoId, orgId: org.id, role: "employee", acceptedAt: new Date() });

      const r = await startCycle(empleadoId, org.id, { title: "No debería" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
    },
  );
});

describe("el avance de las fases", () => {
  it("WHEN corre la fase de observación THE SYSTEM SHALL escribirla y pasar a inferencia", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Observa");
    await startCycle(ownerId, org.id, { title: "Vuelta uno" });

    const provider = proveedorFalso({
      observacion: {
        observation: "Tres objetivos del área van tarde.",
        impacto: "Tres entregas comprometidas.",
        tags: ["entregas"],
      },
    });
    const r = await advanceCycle(await cicloDe(org.id), provider);

    expect(r.from).toBe("observacion");
    expect(r.to).toBe("inferencia");
    const despues = await cicloDe(org.id);
    expect(despues.observation).toContain("Tres objetivos");
    expect(despues.tags).toEqual(["entregas"]);
  });

  it(
    "WHEN la respuesta del modelo no cumple el esquema THE SYSTEM SHALL dejar el ciclo donde " +
      "estaba — un ciclo que avanzara con la fase vacía llegaría a proponer sin haber observado",
    async () => {
      const { org, ownerId } = await empresaConDueno("Motor Roto");
      await startCycle(ownerId, org.id, { title: "Vuelta rota" });

      const r = await advanceCycle(await cicloDe(org.id), proveedorRoto);
      expect(r.from).toBe(r.to);
      expect(r.reason).toBeTruthy();
      expect((await cicloDe(org.id)).phase).toBe("observacion");
    },
  );

  it(
    "WHEN la propuesta ya está escrita THE SYSTEM SHALL detenerse y esperar al dueño, corra el " +
      "cron las veces que corra — es la regla que sostiene el producto entero",
    async () => {
      const { org, ownerId } = await empresaConDueno("Motor Espera");
      await startCycle(ownerId, org.id, { title: "Vuelta que espera" });

      const provider = proveedorFalso({
        observacion: { observation: "Algo pasa.", impacto: "No medible aún.", tags: [] },
        inferencia: {
        inference: "Probablemente esto.",
        porques: [
          { pregunta: "¿Por qué pasa?", respuesta: "Porque algo falta." },
          { pregunta: "¿Por qué falta?", respuesta: "Porque nadie lo repone." },
          { pregunta: "¿Por qué nadie?", respuesta: "Porque no hay procedimiento." },
        ],
        causaRaiz: "No existe el procedimiento",
        categoria: "metodos",
        factoresContribuyentes: [],
        evidencia: "Tres objetivos vencidos",
      },
        analisis: { analysis: "Si se corrige, mejora.", siNoSeCorrige: "Se repite el mes que entra.", comoSeVerifica: "Entregas a tiempo en 30 días." },
        sugerencia: {
          suggestion: "Te propongo esto.",
          conviccion: "media",
          siMeDicesQueNo: "Lo mismo vuelve en un mes.",
          tasks: [],
        },
      });

      // Cuatro pasadas: observa, infiere, analiza, propone.
      for (let i = 0; i < 4; i++) await advanceCycle(await cicloDe(org.id), provider);
      expect((await cicloDe(org.id)).phase).toBe("sugerencia");
      expect((await cicloDe(org.id)).aiSuggestion).toBe("Te propongo esto.");

      const llamadasAntes = provider.llamadas;
      // Dos pasadas más del cron: no avanza, y ni siquiera vuelve a llamar al modelo.
      await advanceCycle(await cicloDe(org.id), provider);
      await advanceCycle(await cicloDe(org.id), provider);
      expect((await cicloDe(org.id)).phase).toBe("sugerencia");
      expect(provider.llamadas).toBe(llamadasAntes);
    },
  );

  it("WHEN la fase de sugerencia corre THE SYSTEM SHALL avisarle al dueño en el chat", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Avisa");
    await startCycle(ownerId, org.id, { title: "Vuelta que avisa" });

    const provider = proveedorFalso({
      observacion: { observation: "o", impacto: "i", tags: [] },
      inferencia: {
        inference: "i",
        porques: [
          { pregunta: "¿Por qué pasa?", respuesta: "Porque algo falta." },
          { pregunta: "¿Por qué falta?", respuesta: "Porque nadie lo repone." },
          { pregunta: "¿Por qué nadie?", respuesta: "Porque no hay procedimiento." },
        ],
        causaRaiz: "No existe el procedimiento",
        categoria: "metodos",
        factoresContribuyentes: [],
        evidencia: "Tres objetivos vencidos",
      },
      analisis: { analysis: "a", siNoSeCorrige: "Se repite el mes que entra.", comoSeVerifica: "Entregas a tiempo en 30 días." },
      sugerencia: {
        suggestion: "Contrata a alguien de medio tiempo.",
        conviccion: "alta",
        siMeDicesQueNo: "La carga sigue cayendo en la misma área.",
        tasks: [],
      },
    });
    for (let i = 0; i < 4; i++) await advanceCycle(await cicloDe(org.id), provider);

    const hilo = await listConversation(ownerId, org.id);
    expect(hilo.some((m) => m.content.includes("medio tiempo"))).toBe(true);
    expect(hilo.every((m) => m.role === "improvement")).toBe(true);
  });
});

describe("la decisión del dueño", () => {
  /**
   * Deja una vuelta en `sugerencia` con su propuesta escrita, SIN correr las cuatro fases.
   *
   * Que las cuatro fases lleven hasta aquí ya lo comprueba la suite de arriba, una vez. Repetir
   * ese recorrido en cada prueba de decisión son dieciséis llamadas más contra un Supabase
   * remoto, y con la suite corriendo en paralelo eso rebasaba el timeout de 20 s — un fallo que
   * no decía nada de la lógica, que es la peor clase de prueba roja.
   */
  async function hastaSugerencia(nombre: string) {
    const { org, ownerId } = await empresaConDueno(nombre);
    const abierta = await startCycle(ownerId, org.id, { title: "Para decidir" });
    if (!abierta.ok) throw new Error("no se abrió");

    await db
      .update(improvementCycle)
      .set({
        phase: "sugerencia",
        observation: "o",
        inference: "i",
        analysis: "a",
        aiSuggestion: "Propuesta.",
      })
      .where(eq(improvementCycle.id, abierta.data.id));

    return { org, ownerId, provider: proveedorFalso({}) };
  }

  it("WHEN el dueño acepta THE SYSTEM SHALL pasar a decisión y luego abrir el experimento", async () => {
    const { org, ownerId, provider } = await hastaSugerencia("Motor Acepta");
    const ciclo = await cicloDe(org.id);

    const r = await decideCycle(ownerId, org.id, ciclo.id, { decision: "acepto", feedback: "Va." });
    expect(r.ok).toBe(true);
    expect((await cicloDe(org.id)).phase).toBe("decision");

    // La siguiente corrida del cron abre el experimento y congela las métricas de "antes".
    await advanceCycle(await cicloDe(org.id), provider);
    const despues = await cicloDe(org.id);
    expect(despues.phase).toBe("experimentacion");
    expect(despues.experimentStart).not.toBeNull();
    expect(despues.metrics).toHaveProperty("antes");
  });

  it(
    "WHEN el dueño rechaza THE SYSTEM SHALL cerrar la vuelta como fallida — una propuesta que " +
      "no se compró ES un fallo del Director General, y contarla neutral le escondería el " +
      "aprendizaje a la siguiente vuelta",
    async () => {
      const { org, ownerId } = await hastaSugerencia("Motor Rechaza");
      const ciclo = await cicloDe(org.id);

      await decideCycle(ownerId, org.id, ciclo.id, {
        decision: "rechazo",
        feedback: "No quiero mover a nadie.",
      });

      const despues = await cicloDe(org.id);
      expect(despues.phase).toBe("cerrado");
      expect(despues.result).toBe("fallido");
      expect(despues.ownerFeedback).toContain("No quiero mover");
      expect(await activeCycle(ownerId, org.id)).toBeNull();
    },
  );

  it(
    "WHEN el dueño pide modificar THE SYSTEM SHALL volver al análisis y BORRAR la propuesta, " +
      "para que la siguiente se piense de nuevo con su feedback en el contexto",
    async () => {
      const { org, ownerId } = await hastaSugerencia("Motor Modifica");
      const ciclo = await cicloDe(org.id);

      await decideCycle(ownerId, org.id, ciclo.id, {
        decision: "modificar",
        feedback: "Más barato.",
      });

      const despues = await cicloDe(org.id);
      expect(despues.phase).toBe("analisis");
      expect(despues.aiSuggestion).toBeNull();
    },
  );

  it("WHEN la vuelta no está esperando decisión THE SYSTEM SHALL negarse", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Fuera De Turno");
    const abierta = await startCycle(ownerId, org.id, { title: "Recién abierta" });
    if (!abierta.ok) throw new Error("no se abrió");

    const r = await decideCycle(ownerId, org.id, abierta.data.id, { decision: "acepto" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("CONFLICT");
  });

  it("WHEN el dueño cierra una vuelta a mano THE SYSTEM SHALL marcarla neutral, ni éxito ni fallo", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Cierra");
    const abierta = await startCycle(ownerId, org.id, { title: "Ya no aplica" });
    if (!abierta.ok) throw new Error("no se abrió");

    const r = await closeCycle(ownerId, org.id, abierta.data.id, "Se acabó el trimestre");
    expect(r.ok).toBe(true);
    const despues = await cicloDe(org.id);
    expect(despues.phase).toBe("cerrado");
    expect(despues.result).toBe("neutral");
  });
});

describe("el aislamiento entre empresas", () => {
  it(
    "WHEN el dueño de la empresa A usa el id de un ciclo de la empresa B THE SYSTEM SHALL " +
      "responder NOT_FOUND — un id válido de otra empresa no alcanza para nada",
    async () => {
      const a = await empresaConDueno("Motor Aislamiento A");
      const b = await empresaConDueno("Motor Aislamiento B");
      const deB = await startCycle(b.ownerId, b.org.id, { title: "De la B" });
      if (!deB.ok) throw new Error("no se abrió");

      const r = await decideCycle(a.ownerId, a.org.id, deB.data.id, { decision: "acepto" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");

      const cerrar = await closeCycle(a.ownerId, a.org.id, deB.data.id);
      expect(cerrar.ok).toBe(false);
      // Y la vuelta de B sigue viva e intacta.
      expect((await activeCycle(b.ownerId, b.org.id))?.id).toBe(deB.data.id);
    },
  );
});

describe("la delegación", () => {
  it(
    "WHEN hay que repartir una tarea dentro de un área THE SYSTEM SHALL dársela a quien menos " +
      "objetivos abiertos trae — por carga, nunca por nombre",
    async () => {
      const { org } = await empresaConDueno("Motor Reparto");
      const [ventas] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Ventas", color: "#7c5cff" })
        .returning();
      if (!ventas) throw new Error("no se creó el área");

      const cargado = crypto.randomUUID();
      const libre = crypto.randomUUID();
      for (const id of [cargado, libre]) {
        await db.insert(profile).values({ id, email: `${id}@example.com` });
        createdProfileIds.push(id);
        await db
          .insert(membership)
          .values({ userId: id, orgId: org.id, role: "employee", areaId: ventas.id, acceptedAt: new Date() });
      }

      // Al primero se le cargan dos objetivos abiertos; al segundo, ninguno.
      const { objective } = await import("@jotapuntoce/db/schema");
      for (const t of ["Uno", "Dos"]) {
        await db.insert(objective).values({
          orgId: org.id,
          areaId: ventas.id,
          title: t,
          impactWeight: 10,
          assignedEmployeeId: cargado,
          dueDate: new Date(Date.now() + 86_400_000),
        });
      }

      expect(await elegirResponsable(org.id, ventas.id)).toBe(libre);
    },
  );

  it("WHEN el área no tiene a nadie THE SYSTEM SHALL dejar la tarea sin dueño, no inventar uno", async () => {
    const { org } = await empresaConDueno("Motor Area Vacia");
    const [vacia] = await db
      .insert(area)
      .values({ orgId: org.id, name: "Vacía", color: "#22d3ee" })
      .returning();
    if (!vacia) throw new Error("no se creó el área");

    expect(await elegirResponsable(org.id, vacia.id)).toBeNull();
    expect(await elegirResponsable(org.id, null)).toBeNull();
  });

  it(
    "WHEN la fase de sugerencia propone tareas THE SYSTEM SHALL crearlas y dejárselas ver SOLO a " +
      "quien se le asignaron",
    async () => {
      const { org, ownerId } = await empresaConDueno("Motor Tareas");
      const [soporte] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Soporte", color: "#10b981" })
        .returning();
      if (!soporte) throw new Error("no se creó el área");

      const quien = crypto.randomUUID();
      const otro = crypto.randomUUID();
      await db.insert(profile).values({ id: quien, email: `${quien}@example.com` });
      await db.insert(profile).values({ id: otro, email: `${otro}@example.com` });
      createdProfileIds.push(quien, otro);
      await db
        .insert(membership)
        .values({ userId: quien, orgId: org.id, role: "employee", areaId: soporte.id, acceptedAt: new Date() });
      await db
        .insert(membership)
        .values({ userId: otro, orgId: org.id, role: "employee", acceptedAt: new Date() });

      await startCycle(ownerId, org.id, { title: "Vuelta con tareas" });
      const provider = proveedorFalso({
        observacion: { observation: "o", impacto: "i", tags: [] },
        inferencia: {
        inference: "i",
        porques: [
          { pregunta: "¿Por qué pasa?", respuesta: "Porque algo falta." },
          { pregunta: "¿Por qué falta?", respuesta: "Porque nadie lo repone." },
          { pregunta: "¿Por qué nadie?", respuesta: "Porque no hay procedimiento." },
        ],
        causaRaiz: "No existe el procedimiento",
        categoria: "metodos",
        factoresContribuyentes: [],
        evidencia: "Tres objetivos vencidos",
      },
        analisis: { analysis: "a", siNoSeCorrige: "Se repite el mes que entra.", comoSeVerifica: "Entregas a tiempo en 30 días." },
        sugerencia: {
          suggestion: "Hay que contestar más rápido.",
          conviccion: "alta",
          siMeDicesQueNo: "Las quejas suben otra vez en dos semanas.",
          // El nombre del área llega sin acentos ni mayúsculas exactas a propósito: así se
          // comprueba que resuelve igual, que es lo que evita que el modelo tenga que acertarle.
          tasks: [
            {
              title: "Contestar en menos de 2 h",
              areaName: "soporte",
              atacaLaRaiz: "Pone el estándar que no existía.",
            },
          ],
        },
      });
      for (let i = 0; i < 4; i++) await advanceCycle(await cicloDe(org.id), provider);

      const tareas = await db
        .select()
        .from(delegatedTask)
        .where(eq(delegatedTask.orgId, org.id));
      expect(tareas).toHaveLength(1);
      expect(tareas[0]?.areaId).toBe(soporte.id);
      expect(tareas[0]?.assignedTo).toBe(quien);

      expect(await listMyDelegatedTasks(quien, org.id)).toHaveLength(1);
      expect(await listMyDelegatedTasks(otro, org.id)).toHaveLength(0);
    },
  );

  it(
    "WHEN alguien intenta contestar la tarea de otra persona THE SYSTEM SHALL negarse, aunque " +
      "sea de su misma empresa",
    async () => {
      const { org, ownerId } = await empresaConDueno("Motor Tarea Ajena");
      const abierta = await startCycle(ownerId, org.id, { title: "Vuelta" });
      if (!abierta.ok) throw new Error("no se abrió");

      const mio = crypto.randomUUID();
      const ajeno = crypto.randomUUID();
      for (const id of [mio, ajeno]) {
        await db.insert(profile).values({ id, email: `${id}@example.com` });
        createdProfileIds.push(id);
        await db
          .insert(membership)
          .values({ userId: id, orgId: org.id, role: "employee", acceptedAt: new Date() });
      }

      const [tarea] = await db
        .insert(delegatedTask)
        .values({ orgId: org.id, cycleId: abierta.data.id, assignedTo: mio, title: "Es mía" })
        .returning();
      if (!tarea) throw new Error("no se creó la tarea");

      const deOtro = await respondToTask(ajeno, org.id, tarea.id, { status: "aceptada" });
      expect(deOtro.ok).toBe(false);

      const propia = await respondToTask(mio, org.id, tarea.id, { status: "aceptada" });
      expect(propia.ok).toBe(true);
    },
  );

  it(
    "WHEN la recepción cuenta mis tareas THE SYSTEM SHALL contar solo las mías y solo las " +
      "abiertas",
    async () => {
      const { org, ownerId } = await empresaConDueno("Motor Contador");
      const abierta = await startCycle(ownerId, org.id, { title: "Vuelta" });
      if (!abierta.ok) throw new Error("no se abrió");

      // En dos inserts y no en un bucle de cuatro: este archivo habla con un Supabase remoto y
      // sus pruebas corren en paralelo contra un timeout de 20s — cada ida y vuelta de menos
      // cuenta.
      const mio = crypto.randomUUID();
      const ajeno = crypto.randomUUID();
      createdProfileIds.push(mio, ajeno);
      await db.insert(profile).values([mio, ajeno].map((id) => ({ id, email: `${id}@example.com` })));
      await db.insert(membership).values(
        [mio, ajeno].map((id) => ({
          userId: id,
          orgId: org.id,
          role: "employee" as const,
          acceptedAt: new Date(),
        })),
      );

      expect(await countMyOpenDelegations(mio, org.id)).toBe(0);

      await db.insert(delegatedTask).values([
        { orgId: org.id, cycleId: abierta.data.id, assignedTo: mio, title: "Sugerida" },
        {
          orgId: org.id,
          cycleId: abierta.data.id,
          assignedTo: mio,
          title: "En curso",
          status: "en_progreso",
        },
        // No cuentan: una ya cerrada, una rechazada, y una que es de otra persona.
        {
          orgId: org.id,
          cycleId: abierta.data.id,
          assignedTo: mio,
          title: "Terminada",
          status: "completada",
        },
        {
          orgId: org.id,
          cycleId: abierta.data.id,
          assignedTo: mio,
          title: "No me tocó",
          status: "rechazada",
        },
        { orgId: org.id, cycleId: abierta.data.id, assignedTo: ajeno, title: "De otro" },
      ]);

      expect(await countMyOpenDelegations(mio, org.id)).toBe(2);
      expect(await countMyOpenDelegations(ajeno, org.id)).toBe(1);
    },
  );
});

describe("la conversación", () => {
  it("WHEN quien escribe no es el dueño THE SYSTEM SHALL no guardar nada", async () => {
    const { org } = await empresaConDueno("Motor Chat Ajeno");
    const empleadoId = crypto.randomUUID();
    await db.insert(profile).values({ id: empleadoId, email: `${empleadoId}@example.com` });
    createdProfileIds.push(empleadoId);
    await db
      .insert(membership)
      .values({ userId: empleadoId, orgId: org.id, role: "employee", acceptedAt: new Date() });

    const { sendOwnerMessage } = await import("../server/improvement/chat.ts");
    const r = await sendOwnerMessage(empleadoId, org.id, { content: "hola" });
    expect(r.ok).toBe(false);

    const filas = await db.select().from(ownerMessage).where(eq(ownerMessage.orgId, org.id));
    expect(filas).toHaveLength(0);
  });

  it(
    "WHEN el dueño cuelga un mensaje de un ciclo de otra empresa THE SYSTEM SHALL rechazarlo — " +
      "un cycleId del cuerpo de un POST no es de fiar",
    async () => {
      const a = await empresaConDueno("Motor Chat A");
      const b = await empresaConDueno("Motor Chat B");
      const deB = await startCycle(b.ownerId, b.org.id, { title: "De la B" });
      if (!deB.ok) throw new Error("no se abrió");

      const { sendOwnerMessage } = await import("../server/improvement/chat.ts");
      const r = await sendOwnerMessage(a.ownerId, a.org.id, {
        content: "sobre el ciclo ajeno",
        cycleId: deB.data.id,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
    },
  );

  it("el hilo de un dueño no incluye el de otra empresa", async () => {
    const a = await empresaConDueno("Motor Hilo A");
    const b = await empresaConDueno("Motor Hilo B");

    const { sendOwnerMessage } = await import("../server/improvement/chat.ts");
    await sendOwnerMessage(a.ownerId, a.org.id, { content: "de la A" });
    await sendOwnerMessage(b.ownerId, b.org.id, { content: "de la B" });

    const hiloA = await listConversation(a.ownerId, a.org.id);
    expect(hiloA).toHaveLength(1);
    expect(hiloA[0]?.content).toBe("de la A");
  });
});

describe("el tablero de resultados", () => {
  it("WHEN no hay ninguna vuelta cerrada THE SYSTEM SHALL dejar la tasa en null, nunca en 0%", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Analytics");
    await startCycle(ownerId, org.id, { title: "Apenas empieza" });

    const { loadAnalytics } = await import("../server/improvement/analytics.ts");
    const a = await loadAnalytics(ownerId, org.id);

    expect(a.cyclesTotal).toBe(1);
    expect(a.cyclesOpen).toBe(1);
    // 0% diría "Improvement falla siempre"; null dice "todavía no hay con qué juzgarlo".
    expect(a.successRate).toBeNull();
    expect(a.avgCycleDurationDays).toBeNull();
  });

  it("WHEN quien pregunta no es el dueño THE SYSTEM SHALL devolver el tablero en ceros", async () => {
    const { org } = await empresaConDueno("Motor Analytics Ajeno");
    const empleadoId = crypto.randomUUID();
    await db.insert(profile).values({ id: empleadoId, email: `${empleadoId}@example.com` });
    createdProfileIds.push(empleadoId);
    await db
      .insert(membership)
      .values({ userId: empleadoId, orgId: org.id, role: "employee", acceptedAt: new Date() });

    const { loadAnalytics } = await import("../server/improvement/analytics.ts");
    expect((await loadAnalytics(empleadoId, org.id)).cyclesTotal).toBe(0);
  });
});

describe("las áreas enriquecidas", () => {
  it("WHEN el dueño describe un área THE SYSTEM SHALL guardarlo, y rechazar un icono inventado", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Areas");
    const { createArea, describeArea } = await import("../server/areas/mutations.ts");

    const creada = await createArea(ownerId, org.id, "Ventas", "#7c5cff", {
      description: "Trae clientes nuevos",
      icon: "ventas",
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const [fila] = await db.select().from(area).where(eq(area.id, creada.data));
    expect(fila?.description).toBe("Trae clientes nuevos");
    expect(fila?.icon).toBe("ventas");

    // Un icono que no está en el catálogo se guarda como null en vez de reventar contra el check
    // de la base: la pantalla dibuja el glifo neutro y nadie pierde su cambio de descripción.
    await describeArea(ownerId, org.id, creada.data, { description: "Otra cosa", icon: "cortinas" });
    const [despues] = await db.select().from(area).where(eq(area.id, creada.data));
    expect(despues?.icon).toBeNull();
    expect(despues?.description).toBe("Otra cosa");
  });

  it("el tablero de áreas cuenta lo que cuelga de cada una", async () => {
    const { org, ownerId } = await empresaConDueno("Motor Tablero");
    const [ops] = await db
      .insert(area)
      .values({ orgId: org.id, name: "Operaciones", color: "#22d3ee", icon: "operaciones" })
      .returning();
    if (!ops) throw new Error("no se creó el área");

    const persona = crypto.randomUUID();
    await db.insert(profile).values({ id: persona, email: `${persona}@example.com` });
    createdProfileIds.push(persona);
    await db
      .insert(membership)
      .values({ userId: persona, orgId: org.id, role: "employee", areaId: ops.id, acceptedAt: new Date() });

    const { loadAreaBoard } = await import("../server/areas/loadAreaBoard.ts");
    const tablero = await loadAreaBoard(ownerId, org.id);

    const fila = tablero.find((a) => a.id === ops.id);
    expect(fila?.members).toBe(1);
    expect(fila?.objectivesOpen).toBe(0);
    expect(fila?.icon).toBe("operaciones");
  });

  it(
    "WHEN alguien solo alcanza su área THE SYSTEM SHALL mandarle la suya sola, y ninguna si no " +
      "tiene área asignada",
    async () => {
      const { org } = await empresaConDueno("Motor Tablero Alcance");
      const [uno] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Uno", color: "#7c5cff" })
        .returning();
      await db.insert(area).values({ orgId: org.id, name: "Dos", color: "#22d3ee" });
      if (!uno) throw new Error("no se creó el área");

      const { permissionType } = await import("@jotapuntoce/db/schema");
      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "De área", grants: { equipo: "area" } })
        .returning();
      if (!tipo) throw new Error("no se creó el tipo");

      const conArea = crypto.randomUUID();
      const sinArea = crypto.randomUUID();
      await db.insert(profile).values({ id: conArea, email: `${conArea}@example.com` });
      await db.insert(profile).values({ id: sinArea, email: `${sinArea}@example.com` });
      createdProfileIds.push(conArea, sinArea);
      await db.insert(membership).values({
        userId: conArea,
        orgId: org.id,
        role: "employee",
        areaId: uno.id,
        permissionTypeId: tipo.id,
        acceptedAt: new Date(),
      });
      await db.insert(membership).values({
        userId: sinArea,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        acceptedAt: new Date(),
      });

      const { loadAreaBoard } = await import("../server/areas/loadAreaBoard.ts");
      const suya = await loadAreaBoard(conArea, org.id);
      expect(suya).toHaveLength(1);
      expect(suya[0]?.id).toBe(uno.id);

      // Sin área asignada: ninguna, nunca las dos.
      expect(await loadAreaBoard(sinArea, org.id)).toHaveLength(0);
    },
  );
});

describe("el CRM y el ERP", () => {
  it("WHEN se registra un contacto THE SYSTEM SHALL apilar la nota, no pisar la anterior", async () => {
    const { org, ownerId } = await empresaConDueno("Motor CRM");
    const { client } = await import("@jotapuntoce/db/schema");
    const [cuenta] = await db
      .insert(client)
      .values({ orgId: org.id, name: "Cuenta uno", notes: "Nota vieja" })
      .returning();
    if (!cuenta) throw new Error("no se creó el cliente");

    const { registerContact, listClientContext } = await import(
      "../server/crm/client-extensions.ts"
    );
    const r = await registerContact(ownerId, org.id, cuenta.id, { note: "Hablamos hoy" });
    expect(r.ok).toBe(true);

    const [despues] = await db.select().from(client).where(eq(client.id, cuenta.id));
    expect(despues?.notes).toContain("Hablamos hoy");
    expect(despues?.notes).toContain("Nota vieja");
    expect(despues?.lastContactAt).not.toBeNull();

    // Y con contacto de hoy, la cuenta deja de contar como abandonada.
    const contexto = await listClientContext(ownerId, org.id);
    expect(contexto[0]?.enRiesgo).toBe(false);
  });

  it(
    "WHEN un proyecto declara depender de uno de otra empresa THE SYSTEM SHALL rechazarlo, y " +
      "tampoco se deja depender de sí mismo",
    async () => {
      const a = await empresaConDueno("Motor ERP A");
      const b = await empresaConDueno("Motor ERP B");
      const { project } = await import("@jotapuntoce/db/schema");

      const [pa] = await db.insert(project).values({ orgId: a.org.id, name: "De la A" }).returning();
      const [pb] = await db.insert(project).values({ orgId: b.org.id, name: "De la B" }).returning();
      if (!pa || !pb) throw new Error("no se crearon los proyectos");

      const { setProjectCoordination, loadProjectGraph } = await import("../server/erp/projects.ts");

      const ajena = await setProjectCoordination(a.ownerId, a.org.id, pa.id, {
        dependsOn: [pb.id],
      });
      expect(ajena.ok).toBe(false);

      const circular = await setProjectCoordination(a.ownerId, a.org.id, pa.id, {
        dependsOn: [pa.id],
      });
      expect(circular.ok).toBe(false);

      // Y el grafo de A no sabe nada de B.
      const grafo = await loadProjectGraph(a.ownerId, a.org.id);
      expect(grafo).toHaveLength(1);
      expect(grafo[0]?.bloqueadoPor).toEqual([]);
    },
  );

  it("WHEN un proyecto espera a otro sin terminar THE SYSTEM SHALL marcarlo bloqueado", async () => {
    const { org, ownerId } = await empresaConDueno("Motor ERP Bloqueo");
    const { project } = await import("@jotapuntoce/db/schema");

    const [bloqueante] = await db
      .insert(project)
      .values({ orgId: org.id, name: "Va primero" })
      .returning();
    const [espera] = await db
      .insert(project)
      .values({ orgId: org.id, name: "Va después" })
      .returning();
    if (!bloqueante || !espera) throw new Error("no se crearon los proyectos");

    const { setProjectCoordination, listProjectsAtRisk } = await import("../server/erp/projects.ts");
    await setProjectCoordination(ownerId, org.id, espera.id, { dependsOn: [bloqueante.id] });

    const enRiesgo = await listProjectsAtRisk(ownerId, org.id);
    const fila = enRiesgo.find((p) => p.id === espera.id);
    expect(fila?.bloqueadoPor.map((b) => b.name)).toEqual(["Va primero"]);
    expect(fila?.alertas.some((a) => a.includes("Va primero"))).toBe(true);

    // Cuando el bloqueante termina, deja de bloquear.
    await db
      .update(project)
      .set({ status: "terminado" })
      .where(and(eq(project.id, bloqueante.id), eq(project.orgId, org.id)));
    const despues = await listProjectsAtRisk(ownerId, org.id);
    expect(despues.find((p) => p.id === espera.id)).toBeUndefined();
  });
});

// La bandeja de "Mi trabajo" — el enlace de la recepción dice un número y la pantalla lista tres
// cosas, y las dos se leen del mismo where. Si divergen, el dueño abre una bandeja que dice 3 y
// encuentra 1, y deja de creerle al número para siempre.
describe("mi trabajo", () => {
  it(
    "WHEN alguien abre su bandeja THE SYSTEM SHALL mostrar solo lo suyo y solo lo abierto, y el " +
      "contador coincidir con la lista",
    async () => {
      const { org, ownerId } = await empresaConDueno("Bandeja");

      const mio = crypto.randomUUID();
      const ajeno = crypto.randomUUID();
      createdProfileIds.push(mio, ajeno);
      await db.insert(profile).values([mio, ajeno].map((id) => ({ id, email: `${id}@example.com` })));
      await db.insert(membership).values(
        [mio, ajeno].map((id) => ({
          userId: id,
          orgId: org.id,
          role: "employee" as const,
          acceptedAt: new Date(),
        })),
      );

      const [proy] = await db
        .insert(project)
        .values({ orgId: org.id, name: "Portal" })
        .returning();
      if (!proy) throw new Error("no se creó el proyecto");

      const meta = (title: string, assignedEmployeeId: string | null, status: string) => ({
        orgId: org.id,
        title,
        assignedEmployeeId,
        status,
        impactWeight: 10,
        dueDate: new Date(),
      });
      await db.insert(objective).values([
        meta("Mía abierta", mio, "pending"),
        meta("Mía ya entregada", mio, "completed"),
        meta("De otro", ajeno, "pending"),
        // Sin dueño: existe, pero no es de nadie, así que no entra en la bandeja de nadie.
        meta("Sin asignar", null, "pending"),
      ]);

      await db.insert(projectTask).values([
        { orgId: org.id, projectId: proy.id, title: "Mía pendiente", assignedTo: mio },
        {
          orgId: org.id,
          projectId: proy.id,
          title: "Mía hecha",
          assignedTo: mio,
          status: "hecha",
        },
        { orgId: org.id, projectId: proy.id, title: "De otro", assignedTo: ajeno },
      ]);

      const metas = await listMyObjectives(mio, org.id);
      expect(metas.map((m) => m.title)).toEqual(["Mía abierta"]);
      expect(await countMyOpenObjectives(mio, org.id)).toBe(metas.length);

      const subtareas = await listMyProjectTasks(mio, org.id);
      expect(subtareas.map((t) => t.title)).toEqual(["Mía pendiente"]);
      // El nombre del proyecto viaja con la subtarea: sin él la bandeja dice "haz esto" y no de
      // qué — el join está en el loader justo para eso.
      expect(subtareas[0]?.projectName).toBe("Portal");
      expect(await countMyOpenProjectTasks(mio, org.id)).toBe(subtareas.length);

      // Y el dueño, cuyo alcance le concede la empresa entera, no ve por aquí el trabajo de
      // nadie más: su bandeja son sus cosas, y no tiene ninguna.
      expect(await listMyObjectives(ownerId, org.id)).toHaveLength(0);
      expect(await countMyOpenProjectTasks(ownerId, org.id)).toBe(0);
    },
  );
});

// El método, de punta a punta contra la base. Los esquemas ya garantizan que el modelo NO puede
// entregar un diagnóstico a medias (tests/improvement-director.test.ts); aquí se comprueba lo
// otro: que lo que entrega acabe en columnas donde se pueda agrupar, y no diluido en un párrafo.
describe("la causa raíz", () => {
  it(
    "WHEN la fase de inferencia corre THE SYSTEM SHALL guardar la cadena, la raíz y su 6M en " +
      "columnas — en prosa no se podría contar cuántas veces falló lo mismo",
    async () => {
      const { org, ownerId } = await empresaConDueno("Motor Raiz");
      const abierta = await startCycle(ownerId, org.id, { title: "Entregas tarde" });
      if (!abierta.ok) throw new Error("no se abrió");

      const provider = proveedorFalso({
        observacion: { observation: "o", impacto: "i", tags: [] },
        inferencia: {
          inference: "La causa es el proceso.",
          porques: [
            { pregunta: "¿Por qué llega tarde?", respuesta: "Sale tarde." },
            { pregunta: "¿Por qué sale tarde?", respuesta: "No está surtido." },
            { pregunta: "¿Por qué no se surte?", respuesta: "Nadie repone al cerrar." },
          ],
          causaRaiz: "No existe procedimiento de reposición al cierre de turno",
          categoria: "metodos",
          factoresContribuyentes: ["Rotación alta en almacén"],
          evidencia: "Tres proyectos con fecha vencida",
        },
      });

      await advanceCycle(await cicloDe(org.id), provider); // observa
      await advanceCycle(await cicloDe(org.id), provider); // infiere

      const c = await cicloDe(org.id);
      expect(c.phase).toBe("analisis");
      expect(c.rootCause).toBe("No existe procedimiento de reposición al cierre de turno");
      expect(c.causeCategory).toBe("metodos");
      expect(c.whys).toHaveLength(3);
      expect(c.contributingFactors).toEqual(["Rotación alta en almacén"]);
      // La evidencia se apila bajo la inferencia: es lo que sostiene la cadena, y sin ella el
      // diagnóstico es una historia bien contada.
      expect(c.inference).toContain("Tres proyectos con fecha vencida");
    },
  );

  it(
    "WHEN la categoría no es una de las 6M THE SYSTEM SHALL no avanzar la fase — el check de la " +
      "base es la última palabra, y una fase que falla se queda donde estaba",
    async () => {
      const { org, ownerId } = await empresaConDueno("Motor Raiz Mala");
      const abierta = await startCycle(ownerId, org.id, { title: "Algo" });
      if (!abierta.ok) throw new Error("no se abrió");

      const provider = proveedorFalso({
        observacion: { observation: "o", impacto: "i", tags: [] },
        inferencia: {
          inference: "x",
          porques: [
            { pregunta: "a", respuesta: "b" },
            { pregunta: "c", respuesta: "d" },
            { pregunta: "e", respuesta: "f" },
          ],
          causaRaiz: "y",
          categoria: "mala_suerte",
          factoresContribuyentes: [],
          evidencia: "z",
        },
      });

      await advanceCycle(await cicloDe(org.id), provider);
      const r = await advanceCycle(await cicloDe(org.id), provider);

      expect(r.from).toBe("inferencia");
      expect(r.to).toBe("inferencia");
      expect((await cicloDe(org.id)).rootCause).toBeNull();
    },
  );

  it(
    "WHEN se mide y la raíz sigue viva THE SYSTEM SHALL decirlo, aunque el resultado sea " +
      "exitoso — las tareas pueden completarse con la condición intacta",
    async () => {
      const { org, ownerId } = await empresaConDueno("Motor Raiz Viva");
      const abierta = await startCycle(ownerId, org.id, { title: "Algo" });
      if (!abierta.ok) throw new Error("no se abrió");

      // Se siembra directo en medición: recorrer las seis fases para llegar aquí cuesta unas
      // treinta idas y vueltas al Postgres remoto, y lo que se prueba es la séptima.
      await db
        .update(improvementCycle)
        .set({ phase: "medicion", rootCause: "No hay procedimiento", causeCategory: "metodos" })
        .where(eq(improvementCycle.id, abierta.data.id));

      const provider = proveedorFalso({
        medicion: {
          result: "exitoso",
          note: "Se hicieron las tres tareas.",
          laRaizSigueViva: true,
          learning: "Faltó documentar el procedimiento.",
        },
      });

      await advanceCycle(await cicloDe(org.id), provider);

      const c = await cicloDe(org.id);
      expect(c.phase).toBe("cerrado");
      expect(c.result).toBe("exitoso");
      // Va a la descripción porque es de ahí que buildContext alimenta la vuelta siguiente.
      expect(c.description).toContain("siguió viva");

      const hilo = await listConversation(ownerId, org.id);
      expect(hilo.some((m) => m.content.includes("causa raíz sigue viva"))).toBe(true);
    },
  );
});
