// Las manos del Director General: qué puede mirar, a dónde te puede llevar y qué puede hacer.
//
// TODA herramienta de aquí envuelve una función que YA existe en server/**, y esas funciones ya
// traen su guard adentro (`assertMembership`, `findOwnerMembership`, `resolveSection`). Eso no es
// casualidad, es la razón de que la burbuja se pueda construir: el agente no estrena un sistema de
// permisos, hereda el que ya protege a las pantallas. Un empleado que le pida a su agente el nivel
// de responsabilidad de otro recibe el mismo no que recibiría desde la UI, y lo recibe de la misma
// línea de código.
//
// `soloDueno` NO es seguridad, es higiene: sirve para no ofrecerle al empleado herramientas que
// siempre le van a contestar que no, porque cada herramienta ofrecida y fallada es un turno pagado
// y un modelo confundido. Quien protege es la función de abajo. Si alguna vez las dos se
// contradicen, la de abajo es la que vale.
//
// Las de tipo "hacer" NO se ejecutan durante el bucle (ver conversation.ts): se proponen, el dueño
// toca "Hazlo" y ahí corren. Es la misma regla que sostiene la fase `sugerencia` del motor —
// Improvement propone, el dueño dispone— aplicada a la conversación.
import { z } from "zod";
import { listAreasByOrg } from "../areas/listAreas.ts";
import { listClients, createClient } from "../clients/mutations.ts";
import {
  DEAL_STAGES,
  RISK_FACTORS,
  listClientsAtRisk,
  listClientContext,
  registerContact,
  updateClientContext,
} from "../crm/client-extensions.ts";
import {
  TASK_STATUSES as PROJECT_TASK_STATUSES,
  addProjectTask,
  listMyProjectTasks,
  listProjectTasks,
  listProjectsAtRisk,
  moveProjectTask,
} from "../erp/projects.ts";
import { PROJECT_STATUSES, createProject, listProjects } from "../projects/mutations.ts";
import { createObjective, listMyObjectives, listObjectives } from "../objectives/mutations.ts";
import { EVIDENCE_TYPES } from "../objectives/evidence.ts";
import { createNeed, listNeeds } from "../needs/mutations.ts";
import { createArea } from "../areas/mutations.ts";
import { listTeammates } from "../employees/teammates.ts";
import { loadAnalytics } from "../improvement/analytics.ts";
import { activeCycle, startCycle } from "../improvement/motor.ts";
import {
  completeDelegatedTask,
  listDelegations,
  listMyDelegatedTasks,
  tasksOfCycle,
} from "../improvement/delegation.ts";
import { SECTIONS } from "../permissions/sections.ts";
import type { ToolSpec } from "./gateway.ts";

/**
 * Mirar es gratis y corre solo. Llevar tampoco escribe nada: cambia de pantalla. Hacer escribe, y
 * por eso pasa por el dueño antes de correr.
 */
export type ToolKind = "mirar" | "llevar" | "hacer";

export interface ToolCtx {
  userId: string;
  /** También arma las URLs de `abrir_panel`: el segmento [org] de las rutas ES el orgId. */
  orgId: string;
  esDueno: boolean;
}

export interface DirectorTool {
  name: string;
  kind: ToolKind;
  description: string;
  schema: z.ZodType;
  soloDueno?: boolean;
  /** Cómo se lee la acción en la tarjeta de confirmación. Obligatorio en las de "hacer". */
  resumen?(input: never): string;
  run(ctx: ToolCtx, input: never): Promise<unknown>;
}

/** Azúcar para declarar una herramienta sin perder el tipo del input en `run` y `resumen`. */
function tool<S extends z.ZodType>(t: {
  name: string;
  kind: ToolKind;
  description: string;
  schema: S;
  soloDueno?: boolean;
  resumen?: (input: z.infer<S>) => string;
  run: (ctx: ToolCtx, input: z.infer<S>) => Promise<unknown>;
}): DirectorTool {
  return t as unknown as DirectorTool;
}

const vacio = z.object({});

// ─── Mirar ──────────────────────────────────────────────────────────────────────────────────────

const MIRAR: DirectorTool[] = [
  tool({
    name: "clientes_en_riesgo",
    kind: "mirar",
    description:
      "Las cuentas que necesitan atención: sin contacto hace mucho, marcadas en riesgo, o con " +
      "seguimiento vencido. Úsala cuando pregunten por la cartera, por ventas o por qué cliente " +
      "está frío.",
    schema: vacio,
    run: (c) => listClientsAtRisk(c.userId, c.orgId),
  }),
  tool({
    name: "buscar_clientes",
    kind: "mirar",
    description:
      "La cartera con su contexto comercial: etapa, valor, último contacto, área que la lleva. " +
      "Filtra por etapa si te la piden. Úsala para encontrar un cliente por nombre antes de " +
      "hacer cualquier cosa sobre él, porque las demás herramientas piden su id.",
    schema: z.object({
      etapa: z.enum(DEAL_STAGES).optional().describe("Etapa del trato, si quieres filtrar"),
    }),
    run: (c, i) => listClientContext(c.userId, c.orgId, { stage: i.etapa }),
  }),
  tool({
    name: "proyectos_en_riesgo",
    kind: "mirar",
    description:
      "Los proyectos con alguna alerta: atrasados, frenados por una dependencia, o pasados de " +
      "presupuesto. Úsala cuando pregunten qué va mal en la operación.",
    schema: vacio,
    run: (c) => listProjectsAtRisk(c.userId, c.orgId),
  }),
  tool({
    name: "proyectos",
    kind: "mirar",
    description: "Todos los proyectos con su avance. Úsala para encontrar el id de un proyecto.",
    schema: z.object({
      incluirCerrados: z.boolean().optional().describe("Por defecto solo los activos"),
    }),
    run: (c, i) => listProjects(c.userId, c.orgId, !i.incluirCerrados),
  }),
  tool({
    name: "subtareas_del_proyecto",
    kind: "mirar",
    description: "Las subtareas de un proyecto, con su estado y sus horas.",
    schema: z.object({ projectId: z.uuid() }),
    run: (c, i) => listProjectTasks(c.userId, c.orgId, i.projectId),
  }),
  tool({
    name: "mi_trabajo",
    kind: "mirar",
    description:
      "Todo lo que quien te habla tiene abierto: tareas delegadas por el ciclo, sus objetivos y " +
      "sus subtareas de proyecto. Úsala cuando pregunten qué les toca o qué traen pendiente.",
    schema: vacio,
    run: async (c) => {
      const [delegadas, objetivos, subtareas] = await Promise.all([
        listMyDelegatedTasks(c.userId, c.orgId),
        listMyObjectives(c.userId, c.orgId),
        listMyProjectTasks(c.userId, c.orgId),
      ]);
      return { delegadas, objetivos, subtareas };
    },
  }),
  tool({
    name: "equipo",
    kind: "mirar",
    description: "Quién trabaja en la empresa y en qué área. Úsala para encontrar el id de alguien.",
    schema: vacio,
    run: (c) => listTeammates(c.userId, c.orgId),
  }),
  tool({
    name: "areas",
    kind: "mirar",
    description: "Las áreas de la empresa. Úsala para encontrar el id de un área antes de usarla.",
    schema: vacio,
    run: async (c) => (await listAreasByOrg([c.orgId])).get(c.orgId) ?? [],
  }),
  tool({
    name: "objetivos",
    kind: "mirar",
    description: "Los objetivos vivos de la empresa, con su peso y su fecha.",
    schema: vacio,
    run: (c) => listObjectives(c.userId, c.orgId, { limit: 40 }),
  }),

  // Dueño ─────────────────────────────────────────
  tool({
    name: "como_va_la_empresa",
    kind: "mirar",
    soloDueno: true,
    description:
      "El tablero: cuántas vueltas de mejora se cerraron, cuáles funcionaron, qué tan rápido " +
      "responde el equipo. Úsala cuando pregunten cómo va todo, sin más detalle.",
    schema: vacio,
    run: (c) => loadAnalytics(c.userId, c.orgId),
  }),
  tool({
    name: "la_vuelta_actual",
    kind: "mirar",
    soloDueno: true,
    description:
      "La vuelta de mejora abierta: en qué fase va, la cadena de porqués, la causa raíz con su " +
      "categoría, y las tareas que se repartieron. Úsala cuando pregunten por el ciclo, por el " +
      "diagnóstico o por qué propusiste algo.",
    schema: vacio,
    run: async (c) => {
      const vuelta = await activeCycle(c.userId, c.orgId);
      if (!vuelta) return { vuelta: null, nota: "No hay ninguna vuelta abierta ahora mismo." };
      return { vuelta, tareas: await tasksOfCycle(c.orgId, vuelta.id) };
    },
  }),
  tool({
    name: "tareas_delegadas",
    kind: "mirar",
    soloDueno: true,
    description: "Todo lo que el ciclo repartió al equipo y cómo va cada tarea.",
    schema: vacio,
    run: (c) => listDelegations(c.userId, c.orgId),
  }),
  tool({
    name: "necesidades",
    kind: "mirar",
    soloDueno: true,
    description: "Lo que la empresa registró que le falta, lo más grave arriba.",
    schema: vacio,
    run: (c) => listNeeds(c.userId, c.orgId),
  }),
];

// ─── Llevar ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Un solo destino declarado por pantalla, en vez de una herramienta por sección.
 *
 * `SECTIONS` no alcanza sola: no incluye `improvement`, `control`, `tareas` ni `necesidades`, que
 * son rutas reales sin tipo de permiso porque se protegen por rol. Se listan aquí explícitamente
 * en vez de leerse del directorio para que agregar una carpeta no publique una pantalla sin querer.
 */
const DESTINOS: Record<string, string> = {
  ...Object.fromEntries(SECTIONS.map((s) => [s.slug, s.slug])),
  improvement: "improvement",
  control: "control",
  tareas: "tareas",
  necesidades: "necesidades",
};

const LLEVAR: DirectorTool[] = [
  tool({
    name: "abrir_panel",
    kind: "llevar",
    description:
      "Lleva a quien te habla a la pantalla donde está la información, en vez de describírsela " +
      "entera. Úsala SIEMPRE que la respuesta se vea mejor en su panel: después de contestar en " +
      "una o dos líneas, ábreles el panel. Destinos: " +
      Object.keys(DESTINOS).join(", ") +
      ". 'improvement' es el ciclo de mejora y el chat; 'control' es el tablero del dueño; " +
      "'tareas' es la bandeja personal.",
    schema: z.object({
      destino: z.string().describe("Uno de los destinos listados"),
      abierto: z.uuid().optional().describe("Id de un proyecto, para abrirlo ya desplegado"),
      porque: z.string().max(120).describe("Una frase de por qué los mandas ahí"),
    }),
    run: async (c, i) => {
      const slug = DESTINOS[i.destino];
      if (!slug) {
        return { error: `No existe el panel "${i.destino}". Los que hay: ${Object.keys(DESTINOS).join(", ")}.` };
      }
      const query = i.abierto ? `?abierto=${i.abierto}` : "";
      return { url: `/${c.orgId}/${slug}${query}`, porque: i.porque };
    },
  }),
];

// ─── Hacer ──────────────────────────────────────────────────────────────────────────────────────
//
// Cada `run` de aquí devuelve el Result tipado de la función de abajo tal cual. Si la validación
// real falla, el error vuelve al modelo como resultado de herramienta y puede corregirse solo —
// por eso los esquemas de aquí son descriptivos y no espejos del de abajo: duplicar la validación
// haría que los dos se separaran con el tiempo, y el de abajo es el que manda.

const HACER: DirectorTool[] = [
  tool({
    name: "registrar_contacto",
    kind: "hacer",
    description:
      "Deja asentado que alguien habló con un cliente. Mueve la fecha de último contacto a hoy y " +
      "apila la nota sin pisar las anteriores. Cualquiera del equipo puede.",
    schema: z.object({
      clientId: z.uuid(),
      cliente: z.string().describe("El nombre, solo para que la confirmación se lea"),
      note: z.string().min(3).max(1000).describe("Qué se habló"),
      nextFollowUpAt: z.string().optional().describe("Cuándo toca volver, formato AAAA-MM-DD"),
      healthStatus: z.enum(["healthy", "neutral", "at_risk"]).optional(),
    }),
    resumen: (i) =>
      `Registrar contacto con ${i.cliente}: "${i.note}"` +
      (i.nextFollowUpAt ? ` · seguimiento el ${i.nextFollowUpAt}` : ""),
    run: (c, i) =>
      registerContact(c.userId, c.orgId, i.clientId, {
        note: i.note,
        nextFollowUpAt: i.nextFollowUpAt ?? null,
        healthStatus: i.healthStatus,
      }),
  }),
  tool({
    name: "crear_cliente",
    kind: "hacer",
    description: "Da de alta una cuenta nueva en la cartera.",
    schema: z.object({
      name: z.string().min(2),
      healthStatus: z.enum(["healthy", "neutral", "at_risk"]).optional(),
      notes: z.string().max(2000).optional(),
    }),
    resumen: (i) => `Dar de alta al cliente ${i.name}`,
    run: (c, i) =>
      createClient(c.userId, c.orgId, {
        name: i.name,
        healthStatus: i.healthStatus,
        notes: i.notes ?? null,
      }),
  }),
  tool({
    name: "completar_mi_tarea",
    kind: "hacer",
    description:
      "Marca como hecha una tarea delegada de quien te habla. Solo la propia: para las de otros, " +
      "no hay herramienta.",
    schema: z.object({
      taskId: z.uuid(),
      tarea: z.string().describe("El título, para que la confirmación se lea"),
      note: z.string().max(1000).optional().describe("Qué se hizo"),
    }),
    resumen: (i) => `Marcar hecha la tarea "${i.tarea}"`,
    run: (c, i) => completeDelegatedTask(c.userId, c.orgId, i.taskId, { note: i.note }),
  }),
  tool({
    name: "mover_subtarea",
    kind: "hacer",
    description: "Cambia el estado de una subtarea de proyecto. Cualquiera del equipo puede.",
    schema: z.object({
      taskId: z.uuid(),
      tarea: z.string().describe("El título, para que la confirmación se lea"),
      status: z.enum(PROJECT_TASK_STATUSES),
      actualHours: z.number().min(0).optional(),
    }),
    resumen: (i) => `Mover "${i.tarea}" a ${i.status}`,
    run: (c, i) => moveProjectTask(c.userId, c.orgId, i.taskId, i.status, i.actualHours ?? null),
  }),

  // Dueño ─────────────────────────────────────────
  tool({
    name: "agendar_seguimiento",
    kind: "hacer",
    soloDueno: true,
    description:
      "Cambia el contexto comercial de una cuenta: quién la lleva, cuánto vale, en qué etapa va, " +
      "cuándo toca volver. Para registrar una llamada usa registrar_contacto.",
    schema: z.object({
      clientId: z.uuid(),
      cliente: z.string().describe("El nombre, para que la confirmación se lea"),
      dealStage: z.enum(DEAL_STAGES).optional(),
      dealValue: z.number().min(0).optional(),
      areaId: z.uuid().optional(),
      riskFactors: z.array(z.enum(RISK_FACTORS)).optional(),
      nextFollowUpAt: z.string().optional().describe("Formato AAAA-MM-DD"),
    }),
    resumen: (i) =>
      `Actualizar a ${i.cliente}` +
      [
        i.dealStage ? `etapa ${i.dealStage}` : null,
        i.dealValue != null ? `valor ${i.dealValue}` : null,
        i.nextFollowUpAt ? `seguimiento el ${i.nextFollowUpAt}` : null,
      ]
        .filter(Boolean)
        .reduce((acc, x, n) => acc + (n === 0 ? ": " : ", ") + x, ""),
    run: (c, i) =>
      updateClientContext(c.userId, c.orgId, i.clientId, {
        dealStage: i.dealStage,
        dealValue: i.dealValue,
        areaId: i.areaId,
        riskFactors: i.riskFactors,
        nextFollowUpAt: i.nextFollowUpAt,
      }),
  }),
  tool({
    name: "crear_objetivo",
    kind: "hacer",
    soloDueno: true,
    description:
      "Emite trabajo para alguien del equipo. `impactWeight` es de 0 a 100 y decide los puntos " +
      "que vale. `kind` ipa es actividad que produce ingreso directo. Si no sabes el área o la " +
      "persona, míralas primero.",
    schema: z.object({
      title: z.string().min(3),
      description: z.string().max(2000).optional(),
      impactWeight: z.number().int().min(0).max(100),
      dueDate: z.string().describe("Formato AAAA-MM-DD"),
      areaId: z.uuid().optional(),
      assignedEmployeeId: z.uuid().optional(),
      kind: z.enum(["ipa", "non_ipa"]),
      evidenceType: z.enum(EVIDENCE_TYPES),
    }),
    resumen: (i) => `Emitir el objetivo "${i.title}" para el ${i.dueDate} (peso ${i.impactWeight})`,
    run: (c, i) =>
      createObjective(c.userId, c.orgId, {
        title: i.title,
        description: i.description ?? null,
        impactWeight: i.impactWeight,
        dueDate: i.dueDate,
        areaId: i.areaId ?? null,
        assignedEmployeeId: i.assignedEmployeeId ?? null,
        needId: null,
        kind: i.kind,
        evidenceType: i.evidenceType,
      }),
  }),
  tool({
    name: "crear_area",
    kind: "hacer",
    soloDueno: true,
    description: "Crea un área de la empresa. El color es hex; si no te dicen uno, manda null.",
    schema: z.object({
      name: z.string().min(2),
      color: z.string().nullable().optional().describe("Hex como #7c5cff, o null"),
      description: z.string().max(2000).optional(),
    }),
    resumen: (i) => `Crear el área ${i.name}`,
    run: (c, i) =>
      createArea(c.userId, c.orgId, i.name, i.color ?? TONOS[0]!, {
        description: i.description ?? null,
      }),
  }),
  tool({
    name: "crear_proyecto",
    kind: "hacer",
    soloDueno: true,
    description: "Da de alta un proyecto. Si no sabes el área o el cliente, míralos primero.",
    schema: z.object({
      name: z.string().min(3),
      detail: z.string().max(2000).optional(),
      areaId: z.uuid().optional(),
      clientId: z.uuid().optional(),
      status: z.enum(PROJECT_STATUSES),
      progress: z.number().int().min(0).max(100),
    }),
    resumen: (i) => `Dar de alta el proyecto "${i.name}"`,
    run: (c, i) =>
      createProject(c.userId, c.orgId, {
        name: i.name,
        detail: i.detail ?? null,
        areaId: i.areaId ?? null,
        clientId: i.clientId ?? null,
        status: i.status,
        progress: i.progress,
      }),
  }),
  tool({
    name: "crear_subtarea",
    kind: "hacer",
    soloDueno: true,
    description: "Agrega una subtarea a un proyecto existente.",
    schema: z.object({
      projectId: z.uuid(),
      proyecto: z.string().describe("El nombre, para que la confirmación se lea"),
      title: z.string().min(3),
      areaId: z.uuid().optional(),
      assigneeId: z.uuid().optional(),
      estimatedHours: z.number().min(0).optional(),
    }),
    resumen: (i) => `Agregar "${i.title}" a ${i.proyecto}`,
    run: (c, i) =>
      addProjectTask(c.userId, c.orgId, i.projectId, {
        title: i.title,
        areaId: i.areaId ?? null,
        assigneeId: i.assigneeId ?? null,
        estimatedHours: i.estimatedHours ?? null,
      }),
  }),
  tool({
    name: "registrar_necesidad",
    kind: "hacer",
    soloDueno: true,
    description:
      "Deja asentado que a la empresa le falta algo. Gravedad 1 leve, 2 moderada, 3 crítica. " +
      "Úsala cuando el dueño te cuente un problema que todavía no toca resolver.",
    schema: z.object({
      title: z.string().min(3),
      detail: z.string().max(2000).optional(),
      areaId: z.uuid().optional(),
      severity: z.number().int().min(1).max(3),
    }),
    resumen: (i) => `Registrar la necesidad "${i.title}" (gravedad ${i.severity})`,
    run: (c, i) =>
      createNeed(c.userId, c.orgId, {
        title: i.title,
        detail: i.detail ?? null,
        areaId: i.areaId ?? null,
        severity: i.severity,
        source: "dueno",
      }),
  }),
  tool({
    name: "arrancar_vuelta",
    kind: "hacer",
    soloDueno: true,
    description:
      "Abre una vuelta de mejora sobre un tema. El título ES la definición del problema, así que " +
      "escríbelo con un hecho, un cuándo y un cuánto — de ahí sale el primer porqué de la cadena. " +
      "Solo puede haber una vuelta abierta a la vez.",
    schema: z.object({
      title: z.string().min(3).max(160).describe("Un hecho concreto, no un tema vago"),
      description: z.string().max(2000).optional(),
      areaId: z.uuid().optional(),
    }),
    resumen: (i) => `Arrancar una vuelta de mejora sobre "${i.title}"`,
    run: (c, i) =>
      startCycle(c.userId, c.orgId, {
        title: i.title,
        description: i.description ?? null,
        areaId: i.areaId ?? null,
      }),
  }),
];

/** Rotación de color para un área creada por voz, donde nadie eligió uno. Espeja la paleta de
 *  areas/mutations.ts; area.color es notNull sin default y hay que mandar algo. */
const TONOS = ["#7c5cff", "#22d3ee", "#10b981", "#f59e0b", "#f472b6"] as const;

export const DIRECTOR_TOOLS: DirectorTool[] = [...MIRAR, ...LLEVAR, ...HACER];

export function toolByName(name: string): DirectorTool | undefined {
  return DIRECTOR_TOOLS.find((t) => t.name === name);
}

/**
 * Qué herramientas se le ofrecen a quien está hablando.
 *
 * Al empleado se le recorta la lista —no la autorización— para que su agente no gaste turnos
 * pidiendo cosas que la función de abajo le va a negar igual. Es la misma burbuja con menos manos:
 * el subagente del empleado no es otro producto, es este con `esDueno` en false.
 */
export function toolsFor(esDueno: boolean): DirectorTool[] {
  return DIRECTOR_TOOLS.filter((t) => esDueno || !t.soloDueno);
}

/** El catálogo en el formato que entiende el proveedor. zod 4 trae el traductor de fábrica. */
export function toolSpecs(esDueno: boolean): ToolSpec[] {
  return toolsFor(esDueno).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.schema) as Record<string, unknown>,
  }));
}
