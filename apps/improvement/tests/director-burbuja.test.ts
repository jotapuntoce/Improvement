// La burbuja: el Director con manos.
//
// Lo que esta suite cuida, en orden de importancia:
//
//  1. Una herramienta que ESCRIBE no se ejecuta durante la conversación. Se propone y espera al
//     dueño. Es la misma regla que sostiene la fase `sugerencia` del motor, y si se rompe el
//     producto cambia de significado sin que nadie lo note hasta que algo se creó solo.
//  2. Al empleado no se le ofrecen herramientas del dueño — y si las pide igual, la función de
//     abajo lo para. La lista es comodidad; el guard es la seguridad. Se prueban las dos.
//  3. Todo el catálogo se puede traducir a JSON Schema y toda acción se puede leer en español.
//     Una herramienta rota no se ve hasta que alguien la pide en producción.
//
// El proveedor se inyecta, como en ai-gateway.test.ts: nada de esto toca la red ni una API key.
// Postgres sí es real, porque runConversationTurn cobra el límite por hora y escribe llm_calls.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { client, llmCalls, membership, organization, profile } from "@jotapuntoce/db/schema";
import type { ConversationMessage, ConversationProvider, ConversationTurn, ToolSpec } from "../server/ai/gateway.ts";
import { resolverProveedor } from "../server/ai/gateway.ts";
import { askDirector, runAccion } from "../server/ai/conversation.ts";
import { DIRECTOR_TOOLS, toolByName, toolSpecs, toolsFor } from "../server/ai/tools.ts";
import { buildBurbujaSystem } from "../server/ai/prompts/burbuja.ts";

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

async function empleadoDe(orgId: string) {
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
  createdProfileIds.push(userId);
  await db.insert(membership).values({ userId, orgId, role: "employee", acceptedAt: new Date() });
  return userId;
}

/**
 * Un proveedor guionado: cada turno devuelve lo que le toque del guion, y va registrando qué
 * herramientas se le ofrecieron y qué resultados le volvieron.
 */
function proveedorGuionado(guion: Partial<ConversationTurn>[]) {
  const visto = { ofrecidas: [] as ToolSpec[][], recibido: [] as ConversationMessage[][], turnos: 0 };
  const provider: ConversationProvider = {
    async converse(_system, messages, tools) {
      visto.ofrecidas.push(tools);
      visto.recibido.push([...messages]);
      const paso = guion[visto.turnos++] ?? {};
      return {
        text: paso.text ?? "",
        toolCalls: paso.toolCalls ?? [],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        finishReason: "end_turn",
      };
    },
  };
  return { provider, visto };
}

const ctxBase = (userId: string, orgId: string, esDueno = true) => ({
  userId,
  orgId,
  esDueno,
  nombre: "Jose Carlos",
  empresa: "Pruebas",
  panel: "Clientes",
  inventario: { areas: 2, clientes: 3, proyectos: 1, empleados: 2 },
  ownerBrief: "",
  relacion: "",
});

describe("resolver el proveedor", () => {
  // Regresión real: con ANTHROPIC_API_KEY vacía, requireEnv lanzaba FUERA del try, Next contestaba
  // un 500 con HTML, el res.json() del navegador fallaba y la burbuja decía "se cayó la conexión".
  // El error más fácil de arreglar de todos salía disfrazado del más difícil de diagnosticar.
  it("WHEN falta la llave del proveedor THE SYSTEM SHALL devolver un error tipado, no lanzar", () => {
    const r = resolverProveedor(undefined, () => {
      throw new Error("ANTHROPIC_API_KEY no está configurada — ver .env.example (blueprint §10)");
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("CONFIG_ERROR");
    expect(r.error.retryable).toBe(false);
    // El mensaje nombra la variable que falta — es lo único que necesita ver quien configura.
    expect(r.error.message).toContain("ANTHROPIC_API_KEY");
  });

  it("WHEN hay proveedor inyectado THE SYSTEM SHALL no construir el real", () => {
    const falso = { marca: "inyectado" };
    const r = resolverProveedor(falso, () => {
      throw new Error("esto no se debe llamar");
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provider).toBe(falso);
  });
});

describe("el catálogo de herramientas", () => {
  it("WHEN se traduce el catálogo THE SYSTEM SHALL producir JSON Schema para cada herramienta", () => {
    // Un esquema que zod no puede traducir revienta al armar la request, no al escribirlo.
    for (const t of DIRECTOR_TOOLS) {
      const schema = z.toJSONSchema(t.schema) as { type?: string };
      expect(schema.type, `${t.name} no produjo un objeto`).toBe("object");
    }
    expect(toolSpecs(true).length).toBe(DIRECTOR_TOOLS.length);
  });

  it("WHEN una herramienta escribe THE SYSTEM SHALL exigirle un resumen legible", () => {
    // Sin resumen, la tarjeta de confirmación diría "crear_objetivo" y el dueño estaría
    // aprobando un nombre de función. La confirmación solo vale si se puede leer.
    for (const t of DIRECTOR_TOOLS.filter((x) => x.kind === "hacer")) {
      expect(typeof t.resumen, `${t.name} no tiene resumen`).toBe("function");
    }
  });

  it("WHEN quien habla no es el dueño THE SYSTEM SHALL recortarle la lista", () => {
    const deDueno = toolsFor(true).map((t) => t.name);
    const deEmpleado = toolsFor(false).map((t) => t.name);

    expect(deEmpleado.length).toBeLessThan(deDueno.length);
    expect(deEmpleado).toContain("mi_trabajo");
    expect(deEmpleado).not.toContain("arrancar_vuelta");
    expect(deEmpleado).not.toContain("la_vuelta_actual");
    expect(deEmpleado).not.toContain("como_va_la_empresa");
  });

  it("WHEN se arma el prompt del empleado THE SYSTEM SHALL callarle el razonamiento del ciclo", () => {
    const suyo = buildBurbujaSystem({
      nombre: "Ana",
      esDueno: false,
      panel: "Mi trabajo",
      empresa: "Pruebas",
      inventario: { areas: 2, clientes: 3, proyectos: 1, empleados: 4 },
      ownerBrief: "",
      relacion: "",
    });
    expect(suyo.estable).toContain("Eres SU agente");
    expect(suyo.estable).toContain("no opinas sobre el desempeño");
    // La transferencia inicial es cosa del dueño: al empleado no se le pide cargar la empresa.
    expect(suyo.volatil).not.toContain("LA EMPRESA ESTÁ VACÍA");
  });

  it("WHEN se navega entre paneles THE SYSTEM SHALL dejar intacto el bloque cacheado", () => {
    // El ahorro entero del caché depende de esto: lo que cambia al navegar tiene que estar FUERA
    // del bloque estable. Si un día alguien mete el panel o la fecha en `estable`, el caché se
    // invalida en cada cambio de pantalla y el gasto se multiplica sin que nada se vea roto.
    const base = {
      nombre: "Jose Carlos",
      esDueno: true,
      empresa: "Pruebas",
      inventario: { areas: 2, clientes: 3, proyectos: 1, empleados: 2 },
      ownerBrief: "",
      relacion: "",
    };
    const enClientes = buildBurbujaSystem({ ...base, panel: "Clientes" });
    const enProyectos = buildBurbujaSystem({ ...base, panel: "Proyectos" });

    expect(enClientes.estable).toBe(enProyectos.estable);
    expect(enClientes.volatil).not.toBe(enProyectos.volatil);
    expect(enClientes.volatil).toContain("Clientes");
    // Y el bloque estable no puede traer nada que cambie solo con el tiempo.
    expect(enClientes.estable).not.toContain(new Date().toISOString().slice(0, 4));
  });

  it("WHEN la empresa no tiene nada cargado THE SYSTEM SHALL ponerle la transferencia por delante", () => {
    const vacia = buildBurbujaSystem({
      nombre: "Jose Carlos",
      esDueno: true,
      panel: "recepción",
      empresa: "Nueva",
      inventario: { areas: 0, clientes: 0, proyectos: 0, empleados: 1 },
      ownerBrief: "",
      relacion: "",
    });
    expect(vacia.volatil).toContain("LA EMPRESA ESTÁ VACÍA");
  });
});

describe("la burbuja", () => {
  it("WHEN el Director pide una herramienta que escribe THE SYSTEM SHALL proponerla sin ejecutarla", async () => {
    // LA prueba de esta suite. Si algún día pasa a verde ejecutando, el producto cambió de
    // significado: el Director habría dejado de proponer para empezar a actuar solo.
    const { org, ownerId } = await empresaConDueno("Burbuja Propone");
    const { provider } = proveedorGuionado([
      {
        text: "",
        toolCalls: [
          {
            id: "tc_1",
            name: "crear_cliente",
            input: { name: "Grupo Estrada", healthStatus: "at_risk" },
          },
        ],
      },
      { text: "Te lo dejo listo." },
    ]);

    const r = await askDirector(ctxBase(ownerId, org.id), [], "da de alta a Grupo Estrada", provider);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.acciones).toHaveLength(1);
    expect(r.data.acciones[0]?.tool).toBe("crear_cliente");
    expect(r.data.acciones[0]?.resumen).toContain("Grupo Estrada");

    const filas = await db.select().from(client).where(eq(client.orgId, org.id));
    expect(filas, "la burbuja creó el cliente sin que nadie confirmara").toHaveLength(0);
  });

  it("WHEN el dueño confirma la acción THE SYSTEM SHALL ejecutarla", async () => {
    const { org, ownerId } = await empresaConDueno("Burbuja Ejecuta");

    const r = await runAccion({ userId: ownerId, orgId: org.id, esDueno: true }, "crear_cliente", {
      name: "Grupo Estrada",
      healthStatus: "at_risk",
    });

    expect(r.ok).toBe(true);
    const filas = await db.select().from(client).where(eq(client.orgId, org.id));
    expect(filas).toHaveLength(1);
    expect(filas[0]?.name).toBe("Grupo Estrada");
  });

  it("WHEN se confirma algo que no es una acción THE SYSTEM SHALL negarse", async () => {
    const { org, ownerId } = await empresaConDueno("Burbuja Solo Hacer");
    const ctx = { userId: ownerId, orgId: org.id, esDueno: true };

    // Ni una herramienta de mirar ni una inventada pueden entrar por la puerta de ejecutar.
    for (const nombre of ["clientes_en_riesgo", "abrir_panel", "no_existe"]) {
      const r = await runAccion(ctx, nombre, {});
      expect(r.ok, `${nombre} se dejó ejecutar`).toBe(false);
    }
  });

  it("WHEN un empleado pide una herramienta del dueño THE SYSTEM SHALL pararlo aunque la pida a mano", async () => {
    // La lista recortada es comodidad. Esto prueba la cerradura de verdad: la función de abajo.
    const { org } = await empresaConDueno("Burbuja Empleado");
    const empleadoId = await empleadoDe(org.id);

    const r = await runAccion(
      { userId: empleadoId, orgId: org.id, esDueno: false },
      "arrancar_vuelta",
      { title: "Quiero dirigir yo" },
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("FORBIDDEN");
  });

  it("WHEN el Director pide una herramienta que solo mira THE SYSTEM SHALL correrla y devolverle el resultado", async () => {
    const { org, ownerId } = await empresaConDueno("Burbuja Mira");
    const { provider, visto } = proveedorGuionado([
      { text: "", toolCalls: [{ id: "tc_1", name: "clientes_en_riesgo", input: {} }] },
      { text: "No hay ninguna cuenta fría." },
    ]);

    const r = await askDirector(ctxBase(ownerId, org.id), [], "¿qué cuentas están frías?", provider);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.acciones).toHaveLength(0);
    expect(r.data.texto).toContain("No hay ninguna cuenta fría");

    // El resultado volvió al modelo: sin esto el Director contestaría de memoria.
    const segundoTurno = visto.recibido[1] ?? [];
    expect(segundoTurno.some((m) => m.role === "results")).toBe(true);
  });

  it("WHEN el Director abre un panel THE SYSTEM SHALL devolver la ruta de esta empresa", async () => {
    const { org, ownerId } = await empresaConDueno("Burbuja Lleva");
    const { provider } = proveedorGuionado([
      {
        text: "Están en Clientes.",
        toolCalls: [
          { id: "tc_1", name: "abrir_panel", input: { destino: "clientes", porque: "ahí está la cartera" } },
        ],
      },
      { text: "Te llevé." },
    ]);

    const r = await askDirector(ctxBase(ownerId, org.id), [], "enséñame la cartera", provider);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.navegar?.url).toBe(`/${org.id}/clientes`);
  });

  it("WHEN una herramienta viene con datos inválidos THE SYSTEM SHALL decírselo al modelo sin tumbar la conversación", async () => {
    const { org, ownerId } = await empresaConDueno("Burbuja Corrige");
    const { provider, visto } = proveedorGuionado([
      // Le falta `name`, que el esquema exige.
      { text: "", toolCalls: [{ id: "tc_1", name: "crear_cliente", input: { healthStatus: "at_risk" } }] },
      { text: "¿Cómo se llama?" },
    ]);

    const r = await askDirector(ctxBase(ownerId, org.id), [], "da de alta un cliente", provider);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.acciones).toHaveLength(0);
    expect(r.data.texto).toContain("¿Cómo se llama?");

    const resultados = (visto.recibido[1] ?? []).find((m) => m.role === "results");
    expect(resultados?.role === "results" && resultados.results[0]?.isError).toBe(true);
  });

  it("WHEN se habla con el Director THE SYSTEM SHALL cobrar un renglón por turno", async () => {
    // Cada vuelta del bucle es una llamada pagada. Un gasto que no aparece en llm_calls es un
    // gasto que nadie va a encontrar — y la burbuja llama más seguido que el motor.
    const { org, ownerId } = await empresaConDueno("Burbuja Cobra");
    const { provider } = proveedorGuionado([
      { text: "", toolCalls: [{ id: "tc_1", name: "areas", input: {} }] },
      { text: "Tienes dos áreas." },
    ]);

    await askDirector(ctxBase(ownerId, org.id), [], "¿qué áreas tengo?", provider);

    const cobros = await db.select().from(llmCalls).where(eq(llmCalls.orgId, org.id));
    expect(cobros).toHaveLength(2);
    expect(cobros.every((c) => c.purpose === "burbuja")).toBe(true);
  });

  it("WHEN el hilo trae turnos viejos THE SYSTEM SHALL mandarlos antes de la pregunta nueva", async () => {
    const { org, ownerId } = await empresaConDueno("Burbuja Recuerda");
    const { provider, visto } = proveedorGuionado([{ text: "Sí, Estrada." }]);

    await askDirector(
      ctxBase(ownerId, org.id),
      [
        { role: "user", text: "¿qué cuentas están frías?" },
        { role: "assistant", text: "Una: Grupo Estrada." },
      ],
      "¿y cuál es la peor?",
      provider,
    );

    const mandados = visto.recibido[0] ?? [];
    expect(mandados).toHaveLength(3);
    expect(mandados[0]).toMatchObject({ role: "user", text: "¿qué cuentas están frías?" });
    expect(mandados[2]).toMatchObject({ role: "user", text: "¿y cuál es la peor?" });
  });
});

describe("abrir_panel", () => {
  it("WHEN le piden un panel que no existe THE SYSTEM SHALL decir cuáles hay en vez de armar una ruta rota", async () => {
    const herramienta = toolByName("abrir_panel");
    expect(herramienta).toBeDefined();

    const salida = (await herramienta!.run(
      { userId: "u", orgId: "o", esDueno: true },
      { destino: "contabilidad", porque: "x" } as never,
    )) as { url?: string; error?: string };

    expect(salida.url).toBeUndefined();
    expect(salida.error).toContain("clientes");
  });
});
