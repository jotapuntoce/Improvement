// Fuente única de verdad del esquema — cambia aquí, luego `pnpm db:generate`.
// Nunca se edita a mano un archivo bajo packages/db/migrations/ (ver .claude/rules/base-de-datos.md).
//
// Convención de timestamps: drizzle-orm/pg-core exporta `timestamp(name, { withTimezone: true })`,
// NO una función `timestamptz` separada (el fragmento de ejemplo en blueprint.md §4 la asumía —
// confirmado incorrecto contra node_modules/drizzle-orm/pg-core/columns/timestamp.d.ts en este paso).
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";

// Columnas compartidas por toda tabla (database.md — "Required on every table").
const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`);
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`);

export const organization = pgTable("organization", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Tagline bajo el letrero del edificio (ej. "Eficiencia con Propósito" para JotaPuntoCe). null =
  // el edificio no muestra segunda línea. Ver Building.tsx (packages/ui).
  slogan: text("slogan"),
  // Hex, tono ambiental del edificio/recepción de esta organización (reemplaza --gold ahí). null =
  // usa el tono neutro por default de packages/ui/src/tokens.css.
  accentColor: text("accent_color"),
  // Giro del negocio — uno de los ids de INDUSTRIES (packages/ui/src/building/industries.ts),
  // validado en el borde por server/companyRequests/*.ts (apps/improvement). null o cualquier valor
  // fuera de esa lista = AppIconLarge usa su glyph default (la cuadrícula), nunca lanza.
  industry: text("industry"),
  // Cómo llama el dueño a cada sección de SU empresa digital, y cuáles apagó:
  // {"clientes":{"label":"Obras"},"powerups":{"hidden":true}}. Una columna y no una tabla: son
  // cinco llaves por empresa que solo se leen completas, nunca se consultan ni se ordenan.
  sectionLabels: jsonb("section_labels").notNull().default(sql`'{}'::jsonb`),
  // En qué nivel de evolución va ESTE negocio — índice dentro de EVOLUTION_LEVELS
  // (packages/ui/src/building/evolutionLevels.ts). Los nombres de los niveles son iguales para toda
  // empresa; el camino para subir no lo es: ese camino son sus filas de org_need, no una columna.
  evolutionLevel: integer("evolution_level").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Mirror local de auth.users de Supabase — fuente de verdad de credenciales vive en Supabase Auth,
// no aquí. id = auth.users.id, nunca generado por Postgres.
export const profile = pgTable("profile", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  // Cómo se presenta el dueño en su panel: uno de los ids de OWNER_LABELS
  // (packages/ui/src/building/ownerLabels.ts), validado en el borde. null = sin chip de etiqueta.
  ownerLabel: text("owner_label"),
  // Ruta DENTRO del bucket de Storage, no una URL completa: la URL pública se arma al leer, así el
  // proyecto de Supabase puede cambiar de dominio sin reescribir filas.
  avatarPath: text("avatar_path"),
  // Se captura cuando el empleado acepta su invitación — el único momento en que se le pregunta.
  phone: text("phone"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: createdAt(),
});

/**
 * Un tipo de permiso con nombre, de UNA empresa. El dueño los crea con los nombres de su propio
 * organigrama ("Jefe de obra", "Vendedor"); Improvement no trae ninguno de fábrica — los papeles de
 * un negocio son datos del cliente, no una rama de código (.claude/rules/motor-generico.md).
 */
export const permissionType = pgTable(
  "permission_type",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Mapa sección -> alcance, ej. {"objetivos":"area","clientes":"ninguno"}. Una sección AUSENTE se
    // lee como "ninguno": el default niega, nunca concede (server/permissions/sections.ts).
    grants: jsonb("grants").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_permission_type_org_id").on(t.orgId),
    uniqueIndex("uq_permission_type_org_name").on(t.orgId, t.name),
  ],
);

export const membership = pgTable(
  "membership",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    invitedBy: uuid("invited_by").references(() => profile.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    // El tipo de permiso vive en membership y no en profile porque la misma persona puede estar en
    // dos empresas del mismo dueño con papeles distintos. null = no ve NADA (el default niega).
    permissionTypeId: uuid("permission_type_id").references(() => permissionType.id, {
      onDelete: "set null",
    }),
    areaId: uuid("area_id").references(() => area.id, { onDelete: "set null" }),
    jobTitle: text("job_title"),
    responsibilities: text("responsibilities"),
  },
  (t) => [
    uniqueIndex("uq_membership_user_org").on(t.userId, t.orgId),
    index("idx_membership_user_id").on(t.userId),
    index("idx_membership_org_id").on(t.orgId),
    check("membership_role_check", sql`${t.role} in ('owner','employee')`),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("employee"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    permissionTypeId: uuid("permission_type_id").references(() => permissionType.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [check("invitation_role_check", sql`${t.role} in ('owner','employee')`)],
);

export const area = pgTable(
  "area",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    // Qué responde esta área, en una línea. Lo escribe el dueño y lo lee Improvement: sin esto el
    // Director General sabe que el área existe pero no de qué se hace cargo, y una sugerencia
    // dirigida al área equivocada es peor que ninguna.
    description: text("description"),
    // Uno de los ids de AREA_ICONS (packages/ui/src/building/areaIcons.ts). null = la recepción
    // dibuja el glifo neutro, nunca lanza. Categorías genéricas de función, nunca el giro de una
    // empresa concreta (.claude/rules/motor-generico.md).
    icon: text("icon"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_area_org_id").on(t.orgId),
    check(
      "area_icon_check",
      sql`${t.icon} is null or ${t.icon} in ('ventas','operaciones','ingenieria','soporte','finanzas','personas','marketing','legal','direccion','otro')`,
    ),
  ],
);

export const objective = pgTable(
  "objective",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => area.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    impactWeight: integer("impact_weight").notNull(),
    // 'ipa' = Income Producing Activity: toca el ingreso de la empresa de forma DIRECTA (prospección,
    // marketing, una cena con un cliente). 'non_ipa' es todo lo demás. No es una jerarquía de valor y
    // nunca se le muestra al empleado como tal — es la variable con la que points.ts calcula, nada
    // más. El default es non_ipa porque la mayor parte del trabajo real de una empresa lo es.
    kind: text("kind").notNull().default("non_ipa"),
    // Qué se tiene que entregar para poder marcarlo completado. 'ninguna' = se completa con un clic,
    // como hasta hoy: pedir evidencia en todo convertiría el producto en un checador.
    evidenceType: text("evidence_type").notNull().default("ninguna"),
    // La evidencia entregada, siempre como texto: una URL, una nota o un número en string. Un campo
    // y no cuatro nullables — solo una clase de evidencia aplica por objetivo (la de evidenceType).
    evidenceValue: text("evidence_value"),
    evidenceSubmittedAt: timestamp("evidence_submitted_at", { withTimezone: true }),
    // Veredicto del agente revisor (server/objectives/review.ts). 'sin_revisar' es el estado de todo
    // objetivo recién completado: la revisión es posterior y asíncrona, nunca bloquea al empleado.
    reviewStatus: text("review_status").notNull().default("sin_revisar"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // Quién emitió el trabajo. set null y no cascade: el objetivo sobrevive a quien lo creó.
    createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
    // La necesidad de la empresa que este objetivo atiende. Es lo que impide que el equipo genere
    // veinte tareas chicas porque sí: un objetivo sin necesidad detrás no mueve el nivel de evolución.
    needId: uuid("need_id").references(() => orgNeed.id, { onDelete: "set null" }),
    assignedEmployeeId: uuid("assigned_employee_id").references(() => profile.id),
    status: text("status").notNull().default("pending"),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("objective_impact_weight_range", sql`${t.impactWeight} >= 0 AND ${t.impactWeight} <= 100`),
    check("objective_status_check", sql`${t.status} in ('pending','in_progress','completed')`),
    check("objective_kind_check", sql`${t.kind} in ('ipa','non_ipa')`),
    check(
      "objective_evidence_type_check",
      sql`${t.evidenceType} in ('ninguna','enlace','nota','numero','archivo')`,
    ),
    check(
      "objective_review_status_check",
      sql`${t.reviewStatus} in ('sin_revisar','aprobada','rechazada')`,
    ),
    index("idx_objective_org_id").on(t.orgId),
    index("idx_objective_assignee_status").on(t.assignedEmployeeId, t.status),
    index("idx_objective_org_due_date").on(t.orgId, t.dueDate),
  ],
);

/**
 * Lo que a esta empresa le falta para evolucionar, crecer, mejorar o sostener lo que ya tiene.
 *
 * Es el diagnóstico, y es de dónde salen los objetivos: un objetivo apunta a una necesidad
 * (objective.need_id) y por eso vale lo que vale. Sin esta tabla el equipo puede generar trabajo
 * infinito sin que nada de eso mueva a la empresa.
 *
 * `severity` son los patógenos: qué tan enferma está esa área. Es también lo que se le entrega a
 * Summum cuando la necesidad se deriva — Improvement diagnostica desde adentro, Summum hace el
 * match con la empresa afiliada que entra a resolver.
 */
export const orgNeed = pgTable(
  "org_need",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => area.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    detail: text("detail"),
    // 1 leve, 2 moderado, 3 crítico. Un entero y no tres literales: la severidad se ordena y se
    // suma, y un texto obliga a un mapa de traducción en cada consulta que quiera ordenar.
    severity: integer("severity").notNull().default(2),
    status: text("status").notNull().default("abierta"),
    // Quién la detectó. 'improvement' = la dedujo el Director General; 'dueno' = la dijo el dueño.
    source: text("source").notNull().default("improvement"),
    // El puerto de SALIDA a Summum System: cuándo se derivó y con qué nota. Nada entra por aquí —
    // Summum recibe, no diagnostica (ver la memoria del proyecto improvement-director-general).
    referredAt: timestamp("referred_at", { withTimezone: true }),
    referralNote: text("referral_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_org_need_org_id").on(t.orgId),
    index("idx_org_need_org_status").on(t.orgId, t.status),
    check("org_need_severity_range", sql`${t.severity} >= 1 AND ${t.severity} <= 3`),
    check(
      "org_need_status_check",
      sql`${t.status} in ('abierta','en_progreso','resuelta','derivada')`,
    ),
    check("org_need_source_check", sql`${t.source} in ('improvement','dueno')`),
  ],
);

/**
 * Los proyectos vivos de la empresa del cliente: lo que su equipo está sacando adelante ahora.
 *
 * Distinto de `objective`: un objetivo es una meta con puntos que alguien completa y cobra. Un
 * proyecto es el trabajo que dura semanas y por el que el dueño pregunta "¿cómo va?". Un proyecto
 * puede tener muchos objetivos colgando; un objetivo no es un proyecto chiquito.
 *
 * Distinto de `assembly` (Planos): eso es la herramienta con la que Jose Carlos dibuja cómo se
 * arma un producto. Esto es la cartera de trabajo del cliente.
 */
export const project = pgTable(
  "project",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // A quién se le entrega. Opcional: hay proyectos internos que no son de ningún cliente.
    clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
    // Qué área lo lleva. set null y no cascade: borrar un área no borra el trabajo que hizo.
    areaId: uuid("area_id").references(() => area.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    detail: text("detail"),
    status: text("status").notNull().default("activo"),
    // 0 a 100, capturado a mano. No se deriva de los objetivos: un proyecto puede ir al 80% con
    // cero objetivos cerrados, y un porcentaje calculado mentiría con cara de dato duro.
    progress: integer("progress").notNull().default(0),
    startAt: timestamp("start_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    // Presupuesto y gastado. `spent` se captura a mano igual que `progress`: no hay tabla de
    // gastos de dónde derivarlo, y un número "calculado" a partir de nada mentiría con cara de
    // dato duro. El día que exista esa tabla, este campo se deriva y el comentario se borra.
    budget: numeric("budget", { precision: 14, scale: 2 }),
    spent: numeric("spent", { precision: 14, scale: 2 }),
    // ids de otros project de LA MISMA empresa que tienen que avanzar antes que este. jsonb y no
    // tabla puente: es una lista corta que solo se lee entera y nunca se consulta al revés desde
    // SQL (server/erp/projects.ts arma el grafo en memoria).
    dependsOn: jsonb("depends_on").notNull().default(sql`'[]'::jsonb`),
    risk: text("risk").notNull().default("bajo"),
    // Quién lo lleva. set null: que se vaya la persona no borra el proyecto.
    leadId: uuid("lead_id").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_project_org_id").on(t.orgId),
    index("idx_project_org_status").on(t.orgId, t.status),
    check("project_status_check", sql`${t.status} in ('activo','pausado','terminado')`),
    check("project_progress_range", sql`${t.progress} >= 0 AND ${t.progress} <= 100`),
    check("project_risk_check", sql`${t.risk} in ('bajo','medio','alto')`),
  ],
);
/**
 * Lo que Improvement sabe del dueño de ESTA empresa: cómo trabaja, piensa, ejecuta, delega y
 * visualiza. Es la materia prima del Director General.
 *
 * Append-only, como employee_points_ledger: una respuesta vieja no se corrige, se agrega la nueva.
 * Cómo pensaba el dueño hace seis meses es justo lo que hace visible que cambió.
 *
 * Nunca guarda nada de Jose Carlos: cada Improvement aprende del dueño de SU empresa, no del
 * arquitecto que la construyó.
 */
export const ownerMemory = pgTable(
  "owner_memory",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    // Qué se le preguntó. null cuando la entrada es una observación y no una respuesta.
    question: text("question"),
    answer: text("answer").notNull(),
    // 'arranque' = la conversación de bienvenida; 'observacion' = lo que Improvement dedujo después.
    topic: text("topic").notNull().default("arranque"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_owner_memory_org_id").on(t.orgId),
    index("idx_owner_memory_owner_id").on(t.ownerId),
    check("owner_memory_topic_check", sql`${t.topic} in ('arranque','observacion')`),
  ],
);
// Append-only — nunca se recalcula ni se actualiza una fila existente (ver server/objectives/points.ts).
export const employeePointsLedger = pgTable(
  "employee_points_ledger",
  {
    id: id(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objective.id, { onDelete: "restrict" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_employee_points_ledger_employee_id").on(t.employeeId),
    index("idx_employee_points_ledger_org_id").on(t.orgId),
  ],
);

// Catálogo GLOBAL — no org-scoped, compartido entre todas las empresas cliente.
export const powerupPartner = pgTable("powerup_partner", {
  id: id(),
  businessName: text("business_name").notNull(),
  category: text("category").notNull(),
  discountDescription: text("discount_description").notNull(),
  redemptionInstructions: text("redemption_instructions").notNull(),
  pointsCost: integer("points_cost").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const powerupRedemption = pgTable(
  "powerup_redemption",
  {
    id: id(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => powerupPartner.id, { onDelete: "restrict" }),
    pointsSpent: integer("points_spent").notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().default(sql`now()`),
    status: text("status").notNull().default("redeemed"),
  },
  (t) => [
    index("idx_powerup_redemption_org_id").on(t.orgId),
    check("powerup_redemption_status_check", sql`${t.status} in ('redeemed','cancelled')`),
  ],
);

export const client = pgTable(
  "client",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    healthStatus: text("health_status").notNull().default("neutral"),
    notes: text("notes"),
    // Qué área lleva la cuenta. set null y no cascade: borrar un área no borra al cliente.
    areaId: uuid("area_id").references(() => area.id, { onDelete: "set null" }),
    // Cuándo se habló con el cliente por última vez y cuándo toca volver. Los dos son la materia
    // prima de "clientes en riesgo": un cliente sano al que nadie llama en un mes deja de serlo, y
    // eso no se ve en health_status hasta que ya es tarde.
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    // El tamaño de la cuenta. numeric y no integer: hay monedas con centavos y hay cuentas de
    // millones, y un float redondearía dinero.
    dealValue: numeric("deal_value", { precision: 14, scale: 2 }),
    dealStage: text("deal_stage").notNull().default("prospecto"),
    // Etiquetas cortas de por qué esta cuenta preocupa (["pago_tardio","sin_respuesta"]). jsonb y
    // no tabla aparte: es una lista corta que solo se lee entera, junto con el cliente.
    riskFactors: jsonb("risk_factors").notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_client_org_id").on(t.orgId),
    index("idx_client_org_stage").on(t.orgId, t.dealStage),
    check("client_health_status_check", sql`${t.healthStatus} in ('healthy','neutral','at_risk')`),
    check(
      "client_deal_stage_check",
      sql`${t.dealStage} in ('prospecto','calificado','propuesta','negociacion','ganado','perdido')`,
    ),
  ],
);

export const aiSuggestion = pgTable(
  "ai_suggestion",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    suggestionText: text("suggestion_text").notNull(),
    // Referencia a qué filas del org se usaron (ids, nunca contenido libre) — ver capabilities/ai-llm-integration.md.
    basedOn: jsonb("based_on").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_ai_suggestion_org_id").on(t.orgId),
    check("ai_suggestion_category_check", sql`${t.category} in ('upgrade','servicio_cliente')`),
  ],
);

// Trazabilidad de costo del gateway de IA — ver capabilities/ai-llm-integration.md.
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    // Nunca hardcodeado — resuelto vía skill claude-api antes de cada llamada (ver blueprint §17).
    modelId: text("model_id").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull(),
    finishReason: text("finish_reason").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("idx_llm_calls_org_id").on(t.orgId)],
);

export const reminder = pgTable(
  "reminder",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id").references(() => objective.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    // Idempotencia del cron: solo se entregan filas con delivered_at is null (ver server/reminders/deliver.ts).
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    channel: text("channel").notNull(),
  },
  (t) => [
    index("idx_reminder_org_id").on(t.orgId),
    check("reminder_channel_check", sql`${t.channel} in ('in_app','email')`),
  ],
);

// El Mapa de Construcción — gestionado a mano por Jose Carlos desde apps/admin, solo lectura en apps/improvement.
export const orgBuildStage = pgTable(
  "org_build_stage",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stageOrder: integer("stage_order").notNull(),
    stageName: text("stage_name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("bloqueada"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_org_build_stage_org_order").on(t.orgId, t.stageOrder),
    check(
      "org_build_stage_status_check",
      sql`${t.status} in ('bloqueada','en_progreso','completada')`,
    ),
  ],
);

// ─── Ensambles ────────────────────────────────────────────────────────────────
// El plano de un proyecto visto como piezas conectadas. Modela cómo se construye aquí: primero una
// pieza suelta, luego otra, y al final se dice dónde se engancha cada una. Por eso el orden de las
// piezas NO se guarda como columna — se deriva del grafo de assembly_connection, que es la única
// fuente de verdad del recorrido. Un `order` denormalizado se desincronizaría en cuanto una conexión
// cambie.

export const assembly = pgTable(
  "assembly",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_assembly_org_id").on(t.orgId)],
);

// Una pieza del ensamble. `whatItDoes` es el texto que se abre al hacer click en el dibujo de la
// pieza — se reescribe cuando la pieza evoluciona, y cada reescritura deja su fila en assembly_event.
export const assemblyPiece = pgTable(
  "assembly_piece",
  {
    id: id(),
    assemblyId: uuid("assembly_id")
      .notNull()
      .references(() => assembly.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    whatItDoes: text("what_it_does"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_assembly_piece_assembly_id").on(t.assemblyId)],
);

// Arista dirigida from → to ("el login va antes del dashboard" = from login, to dashboard). Una
// bifurcación no necesita tabla propia: son dos filas con el mismo from_piece_id y distinto
// condition_label.
export const assemblyConnection = pgTable(
  "assembly_connection",
  {
    id: id(),
    assemblyId: uuid("assembly_id")
      .notNull()
      .references(() => assembly.id, { onDelete: "cascade" }),
    fromPieceId: uuid("from_piece_id")
      .notNull()
      .references(() => assemblyPiece.id, { onDelete: "cascade" }),
    toPieceId: uuid("to_piece_id")
      .notNull()
      .references(() => assemblyPiece.id, { onDelete: "cascade" }),
    conditionLabel: text("condition_label"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_assembly_connection_assembly_id").on(t.assemblyId),
    index("idx_assembly_connection_from").on(t.fromPieceId),
    uniqueIndex("uq_assembly_connection_edge").on(t.fromPieceId, t.toPieceId),
    check("assembly_connection_no_self_loop", sql`${t.fromPieceId} <> ${t.toPieceId}`),
  ],
);

// Append-only (sin updated_at, igual que employee_points_ledger): la historia del ensamble. Es lo que
// permite ver cómo evolucionó el plano y lo que se lee para detectar patrones de construcción.
export const assemblyEvent = pgTable(
  "assembly_event",
  {
    id: id(),
    assemblyId: uuid("assembly_id")
      .notNull()
      .references(() => assembly.id, { onDelete: "cascade" }),
    // set null y no cascade: el evento "se eliminó la pieza X" tiene que sobrevivir a la pieza.
    pieceId: uuid("piece_id").references(() => assemblyPiece.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => profile.id),
    eventType: text("event_type").notNull(),
    detail: jsonb("detail").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_assembly_event_assembly_id").on(t.assemblyId),
    check(
      "assembly_event_type_check",
      sql`${t.eventType} in ('assembly_created','piece_added','piece_updated','piece_removed','connection_added','connection_removed')`,
    ),
  ],
);

// La persona detrás de uno o más prospectCompany — Jaime Salinas es el primer caso real (dueño de
// Camibel y Afianza, dos filas de prospect_company distintas bajo el mismo prospect_client). Igual
// que prospectCompany: FUERA del alcance de RLS multi-tenant, solo accesible con la service-role key
// desde apps/admin.
export const prospectClient = pgTable("prospect_client", {
  id: id(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  whatsappPhone: text("whatsapp_phone").notNull(),
  // Cuántas empresas dijo Jose Carlos que tiene, no un conteo derivado — se captura antes de que
  // exista la segunda fila de prospectCompany (ej: registra "2" al agregar solo Camibel, porque ya
  // sabe que Afianza viene después).
  companyCount: integer("company_count").notNull().default(1),
  createdAt: createdAt(),
});

// Backlog interno de Jose Carlos — FUERA del alcance de RLS multi-tenant (sin org_id todavía cuando
// nace). Solo accesible con la service-role key desde apps/admin, nunca desde apps/improvement.
export const prospectCompany = pgTable(
  "prospect_company",
  {
    id: id(),
    prospectClientId: uuid("prospect_client_id")
      .notNull()
      .references(() => prospectClient.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    notes: text("notes"),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("prospecto"),
    orgId: uuid("org_id").references(() => organization.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_prospect_company_client_id").on(t.prospectClientId),
    check(
      "prospect_company_status_check",
      sql`${t.status} in ('prospecto','en_construcción','live')`,
    ),
  ],
);

// Auto-registro de empresa desde apps/improvement — distinto de prospectCompany (backlog manual de
// Jose Carlos, admin-only, antes de que el cliente tenga cuenta). Aquí el cliente YA tiene sesión y
// pide agregar otra empresa a su portafolio; Jose Carlos aprueba o rechaza desde apps/admin. Al
// aprobar, se crea el organization real (y su primera org_build_stage) — mismo patrón que
// provisionOrganization en apps/admin/app/prospects/actions.js, sin la parte de crear usuario de
// Supabase Auth (el requester ya tiene una).
export const companyRequest = pgTable(
  "company_request",
  {
    id: id(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    // Uno de los ids de INDUSTRIES (packages/ui/src/building/industries.ts) — mismo campo que
    // organization.industry, copiado ahí al aprobar.
    industry: text("industry"),
    status: text("status").notNull().default("pending"),
    orgId: uuid("org_id").references(() => organization.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => profile.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_company_request_requester_id").on(t.requesterId),
    check(
      "company_request_status_check",
      sql`${t.status} in ('pending','approved','rejected')`,
    ),
  ],
);

// Lo que el cliente le debe a Improvement por una empresa, y cuándo se cobra. El dueño lo ve en
// /empresas/configuracion; las filas las crea Jose Carlos desde apps/admin.
//
// No hay columna `status`: pagado es exactamente `paid_at is not null`. Un status aparte se
// desincroniza en cuanto alguien escriba uno sin el otro.
//
// `source` y `externalRef` existen desde el día uno para que conectar un procesador de pagos (Whop u
// otro) sea escribir un webhook que marque `paid_at`, sin migrar el esquema: 'manual' es el pago que
// Jose Carlos registra a mano — el caso de Jaime Salinas pagando en efectivo.
export const payment = pgTable(
  "payment",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    concept: text("concept").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("MXN"),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    source: text("source").notNull().default("manual"),
    externalRef: text("external_ref"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_payment_org_id").on(t.orgId),
    index("idx_payment_org_due_date").on(t.orgId, t.dueDate),
    check("payment_amount_positive", sql`${t.amount} > 0`),
  ],
);

// Los indicadores que se dibujan en la tarjeta de UNA empresa, y de dónde sale el número de cada uno.
//
// Antes esto era un catálogo cerrado de 8 KPIs en código (packages/ui/src/building/kpis.ts) y ningún
// cliente real cabía: Jaime Salinas mide autorización de proyectos, avance de obra, ventas y
// postventa — nada de eso es "objetivos activos". Cada dueño mide su negocio, así que la lista vive
// en filas, no en una rama de código (.claude/rules/motor-generico.md).
//
// `source` nombra el adaptador que calcula el número (apps/improvement/server/kpis/sources.ts) y
// `config` lo parametriza: el mismo adaptador `objetivos` cuenta los abiertos de toda la empresa o
// solo los de un área, según la fila. Por eso dos indicadores con el mismo source no son el mismo
// indicador — cada fila trae su propia conexión.
//
// `manualValue` es el escape: un número que todavía no tiene de dónde salir se captura a mano y la
// fila se repunta a un adaptador real después, sin tocar el panel ni migrar nada.
export const orgKpi = pgTable(
  "org_kpi",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    hint: text("hint"),
    source: text("source").notNull(),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    manualValue: integer("manual_value"),
    format: text("format").notNull().default("numero"),
    // Sin unique(org_id, position): reordenar con una restricción de unicidad obliga a escribir
    // posiciones temporales para no chocar a media pasada. El empate se rompe por created_at.
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_org_kpi_org_position").on(t.orgId, t.position),
    check(
      "org_kpi_source_check",
      sql`${t.source} in ('objetivos','puntos','equipo','areas','clientes','manual')`,
    ),
    check("org_kpi_format_check", sql`${t.format} in ('numero','porcentaje','dinero')`),
  ],
);

// ─── El motor de Improvement: siete fases, una vuelta a la vez ─────────────────────────────────
//
// Improvement no es un generador de sugerencias sueltas: dirige. Y dirigir es un ciclo que se
// repite —observa, infiere, analiza, sugiere, el dueño decide, se prueba, se mide— y del que queda
// registro para que la siguiente vuelta sepa cómo salió la anterior.
//
// Las fases se llaman en español porque el dueño las lee tal cual en su pantalla. Corresponden a
// las siete del plan: observation, inference, analysis, suggestion, decision, experimentation,
// measurement.
//
// Una fila de improvement_cycle es una vuelta completa. Nunca se borra al cerrarse: un ciclo
// fallido enseña tanto como uno exitoso, y borrarlo dejaría al motor repitiendo el mismo error
// cada seis horas.
export const IMPROVEMENT_PHASES = [
  "observacion",
  "inferencia",
  "analisis",
  "sugerencia",
  "decision",
  "experimentacion",
  "medicion",
  "cerrado",
] as const;

export const improvementCycle = pgTable(
  "improvement_cycle",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // De quién es el ciclo. El dueño es el único interlocutor del Director General: los empleados
    // ven las tareas que caen del ciclo, nunca el razonamiento que las produjo.
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    // Sobre qué área gira esta vuelta, si gira sobre una. null = la empresa entera.
    areaId: uuid("area_id").references(() => area.id, { onDelete: "set null" }),
    phase: text("phase").notNull().default("observacion"),
    title: text("title").notNull(),
    description: text("description"),
    // El texto que produjo cada fase. Columnas y no filas de improvement_event porque la pantalla
    // del dueño enseña la vuelta completa de un jalón, y armarla desde el log sería reconstruir en
    // cada render lo que ya está decidido. El log queda igual, para el orden y el quién.
    observation: text("observation"),
    inference: text("inference"),
    analysis: text("analysis"),
    aiSuggestion: text("ai_suggestion"),
    // Qué tan convencido está de ESTA propuesta: 'alta' | 'media' | 'baja'.
    //
    // Columna y no una frase dentro de la sugerencia, porque sirve para dos cosas que solo se
    // pueden hacer con un dato: que el dueño sepa cuándo le están insistiendo de verdad y cuándo
    // es una apuesta, y que el propio Director lea su historial de calibración — "dije alta tres
    // veces y las tres salieron mal" es lo que lo hace madurar en vez de repetir. Un director que
    // suena igual de seguro siempre no está dando información, está dando ruido.
    conviction: text("conviction"),
    // ─── Análisis de Causa Raíz. La habilidad nata del Director General, en columnas y no en la
    // prosa de `inference`, por una razón concreta: el valor del método no está en una vuelta
    // sino en diez. "De las últimas diez causas raíz, siete fueron Métodos" es la frase que hace
    // evolucionar una empresa, y con la causa enterrada en un párrafo no se puede contar. Mismo
    // criterio que el catálogo cerrado de risk_factors en `client`.
    //
    // La condición subyacente que, si se corrige, evita que el problema se repita. NO es la causa
    // inmediata ("se rompió la máquina") ni una persona: es lo sistémico que lo permitió.
    rootCause: text("root_cause"),
    // Una de las 6M de Ishikawa. Cerrada a propósito: con texto libre no se agrupa entre ciclos,
    // y agrupar es justo para lo que sirve.
    causeCategory: text("cause_category"),
    // La cadena de porqués que bajó del síntoma a la raíz: [{ pregunta, respuesta }, ...]. Se
    // guarda entera y no solo su conclusión porque el dueño tiene que poder discutir el ESLABÓN
    // en el que no está de acuerdo, no solo el veredicto.
    whys: jsonb("whys").notNull().default(sql`'[]'::jsonb`),
    // Lo que contribuyó pero no es la raíz. Separado a propósito: confundir un factor
    // contribuyente con la causa raíz es el error clásico del método, y produce una solución que
    // alivia el síntoma y deja el problema vivo.
    contributingFactors: jsonb("contributing_factors").notNull().default(sql`'[]'::jsonb`),
    // Cómo se va a saber que de verdad se resolvió: qué indicador y en cuánto tiempo. Es el paso
    // 6 del método, y se escribe ANTES de proponer para que la medición no se invente su propia
    // vara después de ver el resultado.
    verification: text("verification"),
    // 'acepto' | 'rechazo' | 'modificar'. null mientras el dueño no conteste — y el motor NO avanza
    // solo desde 'sugerencia': esa espera es el punto entero del producto.
    ownerDecision: text("owner_decision"),
    ownerFeedback: text("owner_feedback"),
    experimentStart: timestamp("experiment_start", { withTimezone: true }),
    experimentEnd: timestamp("experiment_end", { withTimezone: true }),
    // { antes: {...}, despues: {...} } — los indicadores al abrir y al cerrar el experimento.
    metrics: jsonb("metrics").notNull().default(sql`'{}'::jsonb`),
    result: text("result"),
    // Etiquetas de tema para que la siguiente vuelta encuentre las anteriores parecidas.
    tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_improvement_cycle_org_id").on(t.orgId),
    index("idx_improvement_cycle_org_phase").on(t.orgId, t.phase),
    check(
      "improvement_cycle_phase_check",
      sql`${t.phase} in ('observacion','inferencia','analisis','sugerencia','decision','experimentacion','medicion','cerrado')`,
    ),
    check(
      "improvement_cycle_decision_check",
      sql`${t.ownerDecision} is null or ${t.ownerDecision} in ('acepto','rechazo','modificar')`,
    ),
    check(
      "improvement_cycle_result_check",
      sql`${t.result} is null or ${t.result} in ('exitoso','fallido','neutral')`,
    ),
    // Tres niveles y no un número del 1 al 10: una escala fina invita a poner 7 siempre. Con tres
    // hay que comprometerse, y comprometerse es el punto.
    check(
      "improvement_cycle_conviction_check",
      sql`${t.conviction} is null or ${t.conviction} in ('alta','media','baja')`,
    ),
    // Las 6M de Ishikawa. El catálogo vive aquí y en DIRECTOR_CAUSE_CATEGORIES
    // (server/ai/prompts/director.ts) — el check es la última palabra, como con area_icon_check.
    check(
      "improvement_cycle_cause_category_check",
      sql`${t.causeCategory} is null or ${t.causeCategory} in ('personas','metodos','maquinas','materiales','medio_ambiente','medicion')`,
    ),
  ],
);

/**
 * El log del ciclo: qué pasó, cuándo y quién lo disparó. Append-only.
 *
 * Existe aparte de las columnas del ciclo por una razón: el ciclo guarda el ESTADO (dónde va y qué
 * dice cada fase), el log guarda la HISTORIA (que la fase se corrió dos veces, que el dueño pidió
 * modificar y volvió a sugerencia). Sin el log, un ciclo que rebota entre sugerencia y decisión se
 * ve idéntico a uno que pasó a la primera.
 */
export const improvementEvent = pgTable(
  "improvement_event",
  {
    id: id(),
    // org_id aquí y no solo en el ciclo: la política RLS lo necesita sin un join, igual que en
    // todas las demás tablas org-scoped de este esquema.
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => improvementCycle.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    // 'sistema' = lo movió el cron; 'dueno' = lo movió el dueño desde el chat; 'empleado' = cayó
    // de una tarea delegada que alguien completó.
    triggeredBy: text("triggered_by").notNull().default("sistema"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_improvement_event_cycle_id").on(t.cycleId),
    index("idx_improvement_event_org_id").on(t.orgId),
    check(
      "improvement_event_type_check",
      sql`${t.type} in ('observacion','inferencia','analisis','sugerencia','decision','experimentacion','medicion','cerrado')`,
    ),
    check(
      "improvement_event_trigger_check",
      sql`${t.triggeredBy} in ('sistema','dueno','empleado')`,
    ),
  ],
);

/**
 * La conversación entre el dueño y su Director General.
 *
 * Distinta de owner_memory y no la misma tabla con un campo más: owner_memory es lo que Improvement
 * SABE del dueño (append-only, se lee entera para armar su retrato), y esto es lo que se DIJERON
 * (un hilo con orden, que se lee por tramos). Mezclarlas obligaría a filtrar una de las dos en cada
 * lectura, y el retrato del dueño acabaría contaminado de "ok", "sí", "hazlo".
 */
export const ownerMessage = pgTable(
  "owner_message",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    // 'dueno' | 'improvement'. Quién habla.
    role: text("role").notNull(),
    content: text("content").notNull(),
    // El ciclo del que trata este mensaje, si trata de alguno. set null: cerrar un ciclo no borra
    // lo que se dijo de él.
    cycleId: uuid("cycle_id").references(() => improvementCycle.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_owner_message_org_owner").on(t.orgId, t.ownerId),
    index("idx_owner_message_cycle_id").on(t.cycleId),
    check("owner_message_role_check", sql`${t.role} in ('dueno','improvement')`),
  ],
);

/**
 * Lo que Improvement le propone a alguien del equipo.
 *
 * No es un objective. Un objetivo lo emite el dueño y paga puntos; una tarea delegada la propone el
 * Director General y todavía no es nada hasta que el dueño la aprueba y la persona la acepta. Si
 * fueran la misma tabla, una sugerencia sin aprobar ya estaría pagando puntos.
 *
 * Cuando se acepta se puede materializar en un objective de verdad (objectiveId), y ahí sí entra al
 * motor de puntos por el camino normal.
 */
export const delegatedTask = pgTable(
  "delegated_task",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => improvementCycle.id, { onDelete: "cascade" }),
    assignedTo: uuid("assigned_to").references(() => profile.id, { onDelete: "set null" }),
    areaId: uuid("area_id").references(() => area.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    // Qué se espera que cambie si esto funciona. Es contra esto que la fase de medición compara.
    expectedOutcome: text("expected_outcome"),
    // Por qué esta tarea toca la CAUSA RAÍZ del ciclo y no su síntoma. El filtro del método
    // convertido en columna: una tarea que no puede llenar este campo es un parche, y el dueño
    // está decidiendo justo sobre esa diferencia. Nullable porque una tarea creada a mano por el
    // dueño no sale de un ACR y no tiene por qué justificarse así.
    attacksRoot: text("attacks_root"),
    status: text("status").notNull().default("sugerida"),
    // Lo que el dueño opinó al revisarla ya terminada.
    ownerReview: text("owner_review"),
    result: jsonb("result").notNull().default(sql`'{}'::jsonb`),
    // El objetivo real que nació de esta tarea al aceptarse, si nació alguno.
    objectiveId: uuid("objective_id").references(() => objective.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_delegated_task_org_id").on(t.orgId),
    index("idx_delegated_task_cycle_id").on(t.cycleId),
    index("idx_delegated_task_assigned").on(t.assignedTo, t.status),
    check(
      "delegated_task_status_check",
      sql`${t.status} in ('sugerida','aceptada','rechazada','en_progreso','completada')`,
    ),
  ],
);

/**
 * Las subtareas de un proyecto. El pedazo de ERP que hacía falta para que Improvement pueda decir
 * "el proyecto X está atorado" y señalar exactamente en qué.
 *
 * org_id además de project_id: la política RLS no puede depender de un join para decidir, y toda
 * consulta de la casa filtra por org antes que por nada (no negociable #2 de CLAUDE.md).
 */
export const projectTask = pgTable(
  "project_task",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assignedTo: uuid("assigned_to").references(() => profile.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pendiente"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    estimatedHours: numeric("estimated_hours", { precision: 7, scale: 2 }),
    actualHours: numeric("actual_hours", { precision: 7, scale: 2 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_project_task_project_id").on(t.projectId),
    index("idx_project_task_org_status").on(t.orgId, t.status),
    check(
      "project_task_status_check",
      sql`${t.status} in ('pendiente','por_hacer','en_progreso','revision','hecha')`,
    ),
  ],
);
