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
  date,
  jsonb,
  numeric,
  uniqueIndex,
  index,
  check,
  bigint,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Columnas compartidas por toda tabla (database.md — "Required on every table").
const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`);
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`);

export const organization = pgTable(
  "organization",
  {
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
    // Summum es el muelle; cada Improvement es un barco. Un barco con parent_org_id nulo existe
    // pero no está colgado de ningún muelle todavía (no cobra). El muelle nunca tiene padre.
    kind: text("kind", { enum: ["muelle", "barco"] }).notNull().default("barco"),
    parentOrgId: uuid("parent_org_id").references((): AnyPgColumn => organization.id, { onDelete: "restrict" }),
    // Nivel de membresía que el barco paga a su muelle. null = sin membresía activa.
    membershipPlanId: uuid("membership_plan_id").references((): AnyPgColumn => membershipPlan.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_organization_parent_org_id").on(t.parentOrgId),
    check("organization_kind_check", sql`${t.kind} in ('muelle','barco')`),
    check("organization_muelle_sin_padre", sql`${t.kind} <> 'muelle' or ${t.parentOrgId} is null`),
  ],
);

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
    // La especialidad de la red (specialty.key) que atiende esta área. Dato, no FK: la red vive en otro org.
    specialtyKey: text("specialty_key"),
    createdAt: createdAt(),
  },
  (t) => [index("idx_area_org_id").on(t.orgId)],
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
    // Dirección (blueprint direccion-jaime §4): responsable del issue y en qué lista semanal está.
    // Nulas a propósito — ninguna necesidad existente las tiene, y la migración es solo aditiva.
    ownerProfileId: uuid("owner_profile_id").references(() => profile.id, { onDelete: "set null" }),
    priorityWeek: date("priority_week"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_org_need_org_id").on(t.orgId),
    index("idx_org_need_org_status").on(t.orgId, t.status),
    index("idx_org_need_org_priority").on(t.orgId, t.priorityWeek),
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
// Antes de `project` y no junto a las de Dirección: pgTable evalúa el `enum` al definir la tabla.
export const PROJECT_AUTHORIZATION = ["pendiente", "autorizado", "rechazado"] as const;
export const STAGE_STATUSES = ["pendiente", "en_curso", "terminada"] as const;

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
    dueAt: timestamp("due_at", { withTimezone: true }),
    // Proyectos/obra (blueprint summum-improvement §4): un proyecto nace 'pendiente' y el dueño lo
    // autoriza. Los que ya existían quedan 'autorizado' en la migración proyectos_rls.
    authorizationStatus: text("authorization_status", { enum: PROJECT_AUTHORIZATION })
      .notNull()
      .default("pendiente"),
    authorizedBy: uuid("authorized_by").references(() => profile.id, { onDelete: "set null" }),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    ownerProfileId: uuid("owner_profile_id").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_project_org_id").on(t.orgId),
    index("idx_project_org_status").on(t.orgId, t.status),
    index("idx_project_org_authorization").on(t.orgId, t.authorizationStatus),
    check("project_status_check", sql`${t.status} in ('activo','pausado','terminado')`),
    check("project_progress_range", sql`${t.progress} >= 0 AND ${t.progress} <= 100`),
    check(
      "project_authorization_check",
      sql`${t.authorizationStatus} in ('pendiente','autorizado','rechazado')`,
    ),
  ],
);

/**
 * Las etapas de un proyecto. `weight` dice cuánto pesa cada una en el avance del proyecto y
 * `progress` cuánto lleva; el avance ponderado lo calcula server/erp/projects.ts, no una columna.
 */
export const projectStage = pgTable(
  "project_stage",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    weight: integer("weight").notNull().default(1),
    progress: integer("progress").notNull().default(0),
    status: text("status", { enum: STAGE_STATUSES }).notNull().default("pendiente"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_project_stage_project_position").on(t.projectId, t.position),
    check("project_stage_weight_range", sql`${t.weight} >= 1 AND ${t.weight} <= 100`),
    check("project_stage_progress_range", sql`${t.progress} >= 0 AND ${t.progress} <= 100`),
    check("project_stage_status_check", sql`${t.status} in ('pendiente','en_curso','terminada')`),
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
/** Qué catálogo de PowerUps ven los barcos de un muelle: el global de siempre o el de su red. */
export const CATALOG_MODES = ["global", "red"] as const;

export const powerupPartner = pgTable(
  "powerup_partner",
  {
    id: id(),
    businessName: text("business_name").notNull(),
    category: text("category").notNull(),
    discountDescription: text("discount_description").notNull(),
    redemptionInstructions: text("redemption_instructions").notNull(),
    pointsCost: integer("points_cost").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // Catálogo de la red (blueprint summum-improvement §9.1): null = premio del catálogo global.
    networkOrgId: uuid("network_org_id").references(() => organization.id, { onDelete: "set null" }),
    affiliateId: uuid("affiliate_id").references(() => affiliate.id, { onDelete: "set null" }),
    barcoOrgId: uuid("barco_org_id").references(() => organization.id, { onDelete: "set null" }),
    publishedBy: uuid("published_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("idx_powerup_partner_network").on(t.networkOrgId, t.isActive)],
);

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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_client_org_id").on(t.orgId),
    check("client_health_status_check", sql`${t.healthStatus} in ('healthy','neutral','at_risk')`),
  ],
);

// ── CRM (blueprint summum-improvement §4) ────────────────────────────────────────────────────────
// Antes de `deal`: pgTable evalúa el `enum` al definir la tabla.
export const DEAL_STAGES = ["prospecto", "propuesta", "negociacion", "ganado", "perdido"] as const;

/**
 * La hiperpersonalización de un cliente: sus respuestas a las seis preguntas de HIPER_QUESTIONS
 * (server/crm/preferences.ts) y, si se le falló, qué expectativa no se cumplió. Una fila por cliente.
 */
export const clientPreference = pgTable(
  "client_preference",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .unique()
      .references(() => client.id, { onDelete: "cascade" }),
    answers: jsonb("answers").notNull().default(sql`'{}'::jsonb`),
    unmetNote: text("unmet_note"),
    unmetFlaggedAt: timestamp("unmet_flagged_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

/** Un trato de venta con un cliente. Cerrado ⇔ `ganado` o `perdido`, y la base lo hace cumplir. */
export const deal = pgTable(
  "deal",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("mxn"),
    stage: text("stage", { enum: DEAL_STAGES }).notNull().default("prospecto"),
    ownerProfileId: uuid("owner_profile_id").references(() => profile.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_deal_org_stage").on(t.orgId, t.stage),
    index("idx_deal_client").on(t.clientId),
    check("deal_stage_check", sql`${t.stage} in ('prospecto','propuesta','negociacion','ganado','perdido')`),
    check("deal_amount_nonneg", sql`${t.amountCents} >= 0`),
    check("deal_closed_consistency", sql`(${t.stage} in ('ganado','perdido')) = (${t.closedAt} is not null)`),
  ],
);

export const TICKET_STATUSES = ["abierto", "en_proceso", "resuelto"] as const;

/** Un ticket de postventa de un cliente. Resuelto ⇔ `resolved_at`; la satisfacción solo se califica resuelto. */
export const ticket = pgTable(
  "ticket",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    detail: text("detail"),
    severity: integer("severity").notNull().default(2),
    status: text("status", { enum: TICKET_STATUSES }).notNull().default("abierto"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().default(sql`now()`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    satisfaction: integer("satisfaction"),
    createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_ticket_org_status").on(t.orgId, t.status),
    check("ticket_severity_range", sql`${t.severity} between 1 and 3`),
    check("ticket_status_check", sql`${t.status} in ('abierto','en_proceso','resuelto')`),
    check("ticket_resolved_consistency", sql`(${t.status} = 'resuelto') = (${t.resolvedAt} is not null)`),
    check(
      "ticket_satisfaction_range",
      sql`${t.satisfaction} is null or (${t.satisfaction} between 1 and 5 and ${t.status} = 'resuelto')`,
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
    check("ai_suggestion_category_check", sql`${t.category} in ('upgrade','servicio_cliente','siguiente_movimiento')`),
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
      sql`${t.source} in ('objetivos','puntos','equipo','areas','clientes','manual','proyectos','pendientes','ventas','postventa')`,
    ),
    check("org_kpi_format_check", sql`${t.format} in ('numero','porcentaje','dinero')`),
  ],
);

// Inventario de chequeos (etapa 0 del CRM de JotaPuntoCe): llegan desde la landing o los crea Jose Carlos. FUERA del
// alcance de RLS multi-tenant, igual que prospect_company: solo apps/admin con la service-role key. RLS activado sin
// políticas (migración chequeo_rls) para cerrar PostgREST. Spec: docs/superpowers/specs/2026-10-02-inventario-chequeos-design.md
export const chequeo = pgTable(
  "chequeo",
  {
    id: id(),
    origen: text("origen").notNull(),
    tipo: text("tipo").notNull(),
    nombre: text("nombre"),
    negocio: text("negocio"),
    // slug(negocio)|slug(ciudad) — la unicidad "un chequeo por negocio"; null para emprendedores.
    negocioClave: text("negocio_clave"),
    giro: text("giro").notNull(),
    ciudad: text("ciudad").notNull(),
    correo: text("correo"),
    telefono: text("telefono"),
    canal: text("canal").notNull(),
    canalDetalle: text("canal_detalle"),
    utm: jsonb("utm"),
    enlaces: jsonb("enlaces"),
    sinRedes: boolean("sin_redes").notNull().default(false),
    // [{pregunta, respuesta}] — la pregunta viaja con la respuesta para que cambiar las preguntas no rompa el pasado.
    respuestas: jsonb("respuestas"),
    entrevistaSegundos: integer("entrevista_segundos"),
    entrevistaAt: timestamp("entrevista_at", { withTimezone: true }),
    claveHash: text("clave_hash"),
    etapa: text("etapa").notNull().default("registrado"),
    abrePuerta: text("abre_puerta"),
    proximaAccion: text("proxima_accion"),
    // ISO YYYY-MM-DD como texto: evita el corrimiento de zona horaria de un Date a medianoche UTC.
    proximaFecha: text("proxima_fecha"),
    notas: text("notas"),
    pdfPath: text("pdf_path"),
    // Motor del Chequeo (spec 2026-10-05-motor-chequeo-design.md). `contenido` es lo que valida
    // apps/admin/lib/motor/esquema.js sin notas internas ni fuentes, que van aparte.
    motorEstado: text("motor_estado").notNull().default("sin_empezar"),
    motorError: text("motor_error"),
    contenido: jsonb("contenido"),
    notasInternas: jsonb("notas_internas"),
    etapaProspecto: text("etapa_prospecto"),
    fuentes: jsonb("fuentes"),
    // Lo que juntó el recolector (sitio e Instagram) para el motor; se reusa 7 días al rehacer.
    expediente: jsonb("expediente"),
    aceptaAvisoAt: timestamp("acepta_aviso_at", { withTimezone: true }),
    aceptaCorreos: boolean("acepta_correos").notNull().default(false),
    aceptaCorreosAt: timestamp("acepta_correos_at", { withTimezone: true }),
    prospectClientId: uuid("prospect_client_id").references(() => prospectClient.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_chequeo_correo").on(t.correo).where(sql`${t.correo} is not null`),
    uniqueIndex("uq_chequeo_telefono").on(t.telefono).where(sql`${t.telefono} is not null`),
    uniqueIndex("uq_chequeo_negocio_clave").on(t.negocioClave).where(sql`${t.negocioClave} is not null`),
    check("chequeo_origen_check", sql`${t.origen} in ('landing','propio')`),
    check("chequeo_tipo_check", sql`${t.tipo} in ('negocio','emprendedor')`),
    check(
      "chequeo_canal_check",
      sql`${t.canal} in ('anuncio_meta','referido','summum','tiktok','youtube','anuncio_google','conferencia','webinar','live','reel','otro','directo')`,
    ),
    check(
      "chequeo_etapa_check",
      sql`${t.etapa} in ('registrado','pedido','entregado','contacto','conversacion','diagnostico','propuesta','cliente','perdido')`,
    ),
    check(
      "chequeo_motor_estado_check",
      sql`${t.motorEstado} in ('sin_empezar','en_fila','armando','borrador','aprobado','error')`,
    ),
    check("chequeo_etapa_prospecto_check", sql`${t.etapaProspecto} in ('idea','arrancando','creciendo','consolidado')`),
  ],
);

// Bitácora append-only de cada chequeo: la materia prima de la cadena que diagnostica. Nunca se edita ni se borra.
export const chequeoEvento = pgTable(
  "chequeo_evento",
  {
    id: id(),
    chequeoId: uuid("chequeo_id")
      .notNull()
      .references(() => chequeo.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    autor: text("autor").notNull(),
    detalle: jsonb("detalle"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_chequeo_evento_chequeo_id").on(t.chequeoId),
    check(
      "chequeo_evento_tipo_check",
      sql`${t.tipo} in ('registro','entrevista','etapa','correo','mensaje','llamada','nota','compra','motor')`,
    ),
    check("chequeo_evento_autor_check", sql`${t.autor} in ('prospecto','jose_carlos','improvement')`),
  ],
);

// ── El casco del muelle (spec 2026-10-19). Dinero en centavos enteros, tasas en puntos base. ──
export const CHARGE_KINDS = ["membresia", "venta_propia", "proyecto_summum"] as const;
export const FEE_CHARGE_KINDS = ["venta_propia", "proyecto_summum"] as const;

export const membershipPlan = pgTable(
  "membership_plan",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    monthlyAmountCents: integer("monthly_amount_cents").notNull(),
    currency: text("currency").notNull().default("mxn"),
    stripePriceId: text("stripe_price_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_membership_plan_muelle").on(t.muelleOrgId),
    check("membership_plan_amount_positive", sql`${t.monthlyAmountCents} > 0`),
  ],
);

// La cuenta conectada del barco (cobra a sus clientes) y su cliente en la plataforma (paga su
// membresía). Las tres banderas solo las escribe el webhook account.updated.
export const stripeAccount = pgTable("stripe_account", {
  id: id(),
  orgId: uuid("org_id").notNull().unique().references(() => organization.id, { onDelete: "cascade" }),
  stripeAccountId: text("stripe_account_id").unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  detailsSubmitted: boolean("details_submitted").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// barco_org_id null = tasa de fábrica del muelle; lleno = personalizada de ese barco.
export const feeRate = pgTable(
  "fee_rate",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    barcoOrgId: uuid("barco_org_id").references(() => organization.id, { onDelete: "cascade" }),
    chargeKind: text("charge_kind", { enum: FEE_CHARGE_KINDS }).notNull(),
    percentBps: integer("percent_bps").notNull(),
    fixedCents: integer("fixed_cents").notNull().default(0),
    currency: text("currency").notNull().default("mxn"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_fee_rate_scope").on(t.muelleOrgId, t.barcoOrgId, t.chargeKind).nullsNotDistinct(),
    check("fee_rate_kind_check", sql`${t.chargeKind} in ('venta_propia','proyecto_summum')`),
    check("fee_rate_bps_range", sql`${t.percentBps} between 0 and 10000`),
    check("fee_rate_fixed_nonneg", sql`${t.fixedCents} >= 0`),
  ],
);

// Firma de los dos: un dueño propone, OTRO decide. Nunca se borra; queda como bitácora.
export const feeRateChange = pgTable(
  "fee_rate_change",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    barcoOrgId: uuid("barco_org_id").references(() => organization.id, { onDelete: "cascade" }),
    chargeKind: text("charge_kind", { enum: FEE_CHARGE_KINDS }).notNull(),
    percentBps: integer("percent_bps").notNull(),
    fixedCents: integer("fixed_cents").notNull().default(0),
    proposedBy: uuid("proposed_by").notNull().references(() => profile.id),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().default(sql`now()`),
    decidedBy: uuid("decided_by").references(() => profile.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decision: text("decision", { enum: ["aprobado", "rechazado"] }),
  },
  (t) => [
    index("idx_fee_rate_change_muelle").on(t.muelleOrgId),
    check("fee_rate_change_kind_check", sql`${t.chargeKind} in ('venta_propia','proyecto_summum')`),
    check("fee_rate_change_bps_range", sql`${t.percentBps} between 0 and 10000`),
    check("fee_rate_change_otra_firma", sql`${t.decidedBy} is null or ${t.decidedBy} <> ${t.proposedBy}`),
    check("fee_rate_change_decision_check", sql`${t.decision} is null or ${t.decision} in ('aprobado','rechazado')`),
  ],
);

// Solo se insertan filas, y solo desde el webhook de Stripe. stripe_object_id único = idempotencia.
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id").notNull().references(() => organization.id, { onDelete: "restrict" }),
    barcoOrgId: uuid("barco_org_id").notNull().references(() => organization.id, { onDelete: "restrict" }),
    chargeKind: text("charge_kind", { enum: CHARGE_KINDS }).notNull(),
    grossCents: bigint("gross_cents", { mode: "number" }).notNull(),
    summumFeeCents: bigint("summum_fee_cents", { mode: "number" }).notNull(),
    appliedPercentBps: integer("applied_percent_bps"),
    appliedFixedCents: integer("applied_fixed_cents"),
    currency: text("currency").notNull(),
    stripeObjectId: text("stripe_object_id").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_ledger_entry_muelle_created").on(t.muelleOrgId, t.createdAt),
    index("idx_ledger_entry_barco_created").on(t.barcoOrgId, t.createdAt),
    check("ledger_entry_kind_check", sql`${t.chargeKind} in ('membresia','venta_propia','proyecto_summum')`),
    check("ledger_entry_fee_le_gross", sql`${t.summumFeeCents} between 0 and ${t.grossCents}`),
  ],
);

// ── Dirección (blueprint direccion-jaime) ─────────────────────────────────────────────────────────
// Módulos tipo EOS: V/TO, Scorecard semanal, Issues (= org_need) y Junta L10. Toda personalización de
// un cliente vive en estas filas; ninguna rama de código sabe de un cliente específico.

export const MEASURABLE_DIRECTIONS = ["gte", "lte"] as const;
export const MEASURABLE_UNITS = ["numero", "porcentaje", "dinero"] as const;
// Orden fijo de la junta semanal. Fuente única de los bloques: el check de meeting.current_block y
// apps/improvement/server/direccion/meetings/agenda.ts (que agrega los minutos) leen esta lista.
export const MEETING_BLOCKS = ["segue", "scorecard", "rocks", "headlines", "todos", "ids", "conclude"] as const;

export const orgVision = pgTable("org_vision", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  coreValues: jsonb("core_values").notNull().default(sql`'[]'::jsonb`),
  coreFocus: jsonb("core_focus").notNull().default(sql`'{}'::jsonb`),
  tenYearTarget: jsonb("ten_year_target").notNull().default(sql`'{}'::jsonb`),
  marketingStrategy: jsonb("marketing_strategy").notNull().default(sql`'{}'::jsonb`),
  threeYearPicture: jsonb("three_year_picture").notNull().default(sql`'{}'::jsonb`),
  oneYearPlan: jsonb("one_year_plan").notNull().default(sql`'{}'::jsonb`),
  updatedBy: uuid("updated_by").references(() => profile.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const orgMeasurable = pgTable(
  "org_measurable",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ownerProfileId: uuid("owner_profile_id")
      .notNull()
      .references(() => profile.id),
    goal: numeric("goal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    goalDirection: text("goal_direction", { enum: MEASURABLE_DIRECTIONS }).notNull(),
    unit: text("unit", { enum: MEASURABLE_UNITS }).notNull().default("numero"),
    position: integer("position").notNull().default(0),
    // Archivar y no borrar: la historia de measurable_value se queda.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_org_measurable_org_position").on(t.orgId, t.position),
    check("org_measurable_direction_check", sql`${t.goalDirection} in ('gte','lte')`),
    check("org_measurable_unit_check", sql`${t.unit} in ('numero','porcentaje','dinero')`),
  ],
);

export const measurableValue = pgTable(
  "measurable_value",
  {
    id: id(),
    measurableId: uuid("measurable_id")
      .notNull()
      .references(() => orgMeasurable.id, { onDelete: "cascade" }),
    // Lunes de la semana en America/Mexico_City — sale de weekStart(), nunca se calcula en otro lado.
    weekStart: date("week_start").notNull(),
    value: numeric("value", { precision: 14, scale: 2, mode: "number" }).notNull(),
    enteredBy: uuid("entered_by")
      .notNull()
      .references(() => profile.id),
    // Se reescribe en cada recaptura de la misma semana: hace de updated_at.
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().default(sql`now()`),
    createdAt: createdAt(),
  },
  (t) => [
    unique("uq_measurable_value_week").on(t.measurableId, t.weekStart),
    check("measurable_value_monday", sql`extract(isodow from ${t.weekStart}) = 1`),
  ],
);

export const meeting = pgTable(
  "meeting",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    facilitatorProfileId: uuid("facilitator_profile_id").references(() => profile.id, {
      onDelete: "set null",
    }),
    currentBlock: text("current_block", { enum: MEETING_BLOCKS }),
    notes: jsonb("notes").notNull().default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_meeting_org_scheduled").on(t.orgId, t.scheduledFor),
    index("idx_meeting_org_ended").on(t.orgId, t.endedAt),
    check(
      "meeting_block_check",
      sql`${t.currentBlock} is null or ${t.currentBlock} in ('segue','scorecard','rocks','headlines','todos','ids','conclude')`,
    ),
    check(
      "meeting_end_after_start",
      sql`${t.endedAt} is null or (${t.startedAt} is not null and ${t.endedAt} >= ${t.startedAt})`,
    ),
  ],
);

export const meetingRating = pgTable(
  "meeting_rating",
  {
    id: id(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    rating: integer("rating").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("uq_meeting_rating_person").on(t.meetingId, t.profileId),
    check("meeting_rating_range", sql`${t.rating} between 1 and 10`),
  ],
);

// ─── Red de afiliadas (blueprint summum-improvement §4) ────────────────────────────────────────

export const AFFILIATE_STATUSES = ["activa", "suspendida"] as const;
export const PERSONALITY_SUBJECTS = ["afiliada", "dueno"] as const;

const FRECUENCIA = [
  { value: "siempre", label: "Siempre" },
  { value: "casi_siempre", label: "Casi siempre" },
  { value: "a_veces", label: "A veces" },
] as const;

export const PERSONALITY_VERSION = 1;

/** Cuestionario de personalidad y enfoque, v1. Producto, no cliente: lo usan Summum e Improvement. */
export const PERSONALITY_QUESTIONS = [
  { key: "valor_cumplir", question: "Cumplo lo que prometo, en tiempo y forma.", options: FRECUENCIA },
  { key: "valor_venta_pull", question: "Vendo sin presionar: el cliente llega porque ve el valor.", options: FRECUENCIA },
  { key: "valor_relacion", question: "Conozco a fondo a cada cliente y personalizo lo que le doy.", options: FRECUENCIA },
  { key: "valor_retorno", question: "Reinvierto en experiencias para mis clientes, no en descuentos.", options: FRECUENCIA },
  { key: "valor_transformacion", question: "Trabajo en mi propia transformación: cuerpo, mente y orden.", options: FRECUENCIA },
  {
    key: "ritmo",
    question: "¿A qué ritmo trabajas mejor?",
    options: [
      { value: "rapido_iterativo", label: "Rápido, probando y corrigiendo" },
      { value: "constante_planeado", label: "Constante y planeado" },
      { value: "por_proyectos", label: "Por proyectos, con picos de trabajo" },
    ],
  },
  {
    key: "comunicacion",
    question: "¿Cómo prefieres comunicarte?",
    options: [
      { value: "directo_breve", label: "Directo y breve" },
      { value: "detallado_escrito", label: "Detallado y por escrito" },
      { value: "conversado", label: "Conversado, en persona o llamada" },
    ],
  },
  {
    key: "decision",
    question: "¿Cómo tomas decisiones?",
    options: [
      { value: "datos", label: "Con datos" },
      { value: "experiencia", label: "Con experiencia e intuición" },
      { value: "consenso", label: "En consenso con el equipo" },
    ],
  },
  {
    key: "tipo_negocio",
    question: "¿Con qué tipo de negocio trabajas mejor?",
    options: [
      { value: "servicios", label: "Servicios" },
      { value: "productos", label: "Productos" },
      { value: "proyectos_obra", label: "Proyectos y obra" },
    ],
  },
] as const;

/** true solo con exactamente las nueve llaves y cada valor dentro de sus options. */
export function personalityAnswersValid(answers: unknown): answers is Record<string, string> {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  const entries = answers as Record<string, unknown>;
  if (Object.keys(entries).length !== PERSONALITY_QUESTIONS.length) return false;
  return PERSONALITY_QUESTIONS.every((q) => q.options.some((o) => o.value === entries[q.key]));
}

/** Porcentaje (0-100, redondeado) de respuestas iguales entre dos cuestionarios. */
export function personalityMatch(a: Record<string, string>, b: Record<string, string>): number {
  const iguales = PERSONALITY_QUESTIONS.filter((q) => a[q.key] !== undefined && a[q.key] === b[q.key]).length;
  return Math.round((iguales / PERSONALITY_QUESTIONS.length) * 100);
}

export const specialty = pgTable(
  "specialty",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_specialty_muelle_key").on(t.muelleOrgId, t.key)],
);

export const affiliate = pgTable(
  "affiliate",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    barcoOrgId: uuid("barco_org_id").references(() => organization.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    specialtyKeys: text("specialty_keys").array().notNull().default(sql`'{}'`),
    status: text("status", { enum: AFFILIATE_STATUSES }).notNull().default("activa"),
    publicSlug: text("public_slug").notNull().unique(),
    publicBio: text("public_bio"),
    directoryOptIn: boolean("directory_opt_in").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_affiliate_profile_muelle").on(t.profileId, t.muelleOrgId),
    check("affiliate_status_check", sql`${t.status} in ('activa','suspendida')`),
  ],
);

export const personalityProfile = pgTable(
  "personality_profile",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    subjectKind: text("subject_kind", { enum: PERSONALITY_SUBJECTS }).notNull(),
    // El org donde contestó el dueño; null para una afiliada.
    orgId: uuid("org_id").references(() => organization.id, { onDelete: "set null" }),
    answers: jsonb("answers").notNull(),
    questionnaireVersion: integer("questionnaire_version").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_personality_profile_subject").on(t.profileId, t.subjectKind),
    check("personality_subject_check", sql`${t.subjectKind} in ('afiliada','dueno')`),
  ],
);

// ─── Sello Cénit y sinapsis (blueprint summum-improvement §4) ──────────────────────────────────

export const SEAL_SOURCES = ["manual", "kpi"] as const;
export const SEAL_SUBJECTS = ["barco", "afiliada"] as const;
export const SEAL_APPROVAL = ["pendiente", "aprobada", "rechazada"] as const;
export const SEAL_VIGENCIA = ["vigente", "en_riesgo", "reevaluacion", "suspendido"] as const;
export const PROPOSAL_STATUSES = ["propuesta", "aprobada_socios", "activa", "rechazada"] as const;

/** Los parámetros de la red de un muelle, como datos. min_seal_score null = sin mínimo: nadie se certifica. */
export const muelleSettings = pgTable(
  "muelle_settings",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    minSealScore: integer("min_seal_score"),
    graceDays: integer("grace_days").notNull().default(30),
    proposalMinSeverity: integer("proposal_min_severity").notNull().default(3),
    catalogMode: text("catalog_mode", { enum: CATALOG_MODES }).notNull().default("global"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("muelle_settings_grace_days_range", sql`${t.graceDays} between 1 and 365`),
    check("muelle_settings_min_severity_range", sql`${t.proposalMinSeverity} between 1 and 3`),
    check("muelle_settings_catalog_check", sql`${t.catalogMode} in ('global','red')`),
  ],
);

export const sealRequirement = pgTable(
  "seal_requirement",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    points: integer("points").notNull(),
    source: text("source", { enum: SEAL_SOURCES }).notNull(),
    // Para `kpi`: { source, config, op: "gte" | "lte", threshold }.
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_seal_requirement_code").on(t.muelleOrgId, t.code),
    check("seal_requirement_points_range", sql`${t.points} between 1 and 100`),
    check("seal_requirement_source_check", sql`${t.source} in ('manual','kpi')`),
  ],
);

/** La marca de un requisito manual para un sujeto (un barco o una afiliada). */
export const sealRequirementResult = pgTable(
  "seal_requirement_result",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => sealRequirement.id, { onDelete: "cascade" }),
    subjectKind: text("subject_kind", { enum: SEAL_SUBJECTS }).notNull(),
    barcoOrgId: uuid("barco_org_id").references(() => organization.id, { onDelete: "cascade" }),
    affiliateId: uuid("affiliate_id").references(() => affiliate.id, { onDelete: "cascade" }),
    met: boolean("met").notNull(),
    evidenceNote: text("evidence_note"),
    decidedBy: uuid("decided_by").references(() => profile.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    check("seal_result_subject_kind_check", sql`${t.subjectKind} in ('barco','afiliada')`),
    check(
      "seal_result_subject",
      sql`(${t.subjectKind} = 'barco' and ${t.barcoOrgId} is not null and ${t.affiliateId} is null) or (${t.subjectKind} = 'afiliada' and ${t.affiliateId} is not null and ${t.barcoOrgId} is null)`,
    ),
    uniqueIndex("uq_seal_result_barco").on(t.requirementId, t.barcoOrgId).where(sql`${t.barcoOrgId} is not null`),
    uniqueIndex("uq_seal_result_affiliate").on(t.requirementId, t.affiliateId).where(sql`${t.affiliateId} is not null`),
  ],
);

export const sealEvaluation = pgTable(
  "seal_evaluation",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subjectKind: text("subject_kind", { enum: SEAL_SUBJECTS }).notNull(),
    barcoOrgId: uuid("barco_org_id").references(() => organization.id, { onDelete: "cascade" }),
    affiliateId: uuid("affiliate_id").references(() => affiliate.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    // El mínimo vigente al calcular.
    minScore: integer("min_score"),
    approvalStatus: text("approval_status", { enum: SEAL_APPROVAL }).notNull().default("pendiente"),
    firstApproverId: uuid("first_approver_id").references(() => profile.id),
    secondApproverId: uuid("second_approver_id").references(() => profile.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    vigencia: text("vigencia", { enum: SEAL_VIGENCIA }),
    riskSince: timestamp("risk_since", { withTimezone: true }),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }).notNull().default(sql`now()`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("seal_evaluation_subject_kind_check", sql`${t.subjectKind} in ('barco','afiliada')`),
    check(
      "seal_evaluation_subject",
      sql`(${t.subjectKind} = 'barco' and ${t.barcoOrgId} is not null and ${t.affiliateId} is null) or (${t.subjectKind} = 'afiliada' and ${t.affiliateId} is not null and ${t.barcoOrgId} is null)`,
    ),
    check("seal_evaluation_approval_check", sql`${t.approvalStatus} in ('pendiente','aprobada','rechazada')`),
    check("seal_evaluation_otra_firma", sql`${t.secondApproverId} is null or ${t.secondApproverId} <> ${t.firstApproverId}`),
    check(
      "seal_evaluation_vigencia_check",
      sql`${t.vigencia} is null or ${t.vigencia} in ('vigente','en_riesgo','reevaluacion','suspendido')`,
    ),
    uniqueIndex("uq_seal_eval_pending_barco").on(t.barcoOrgId).where(sql`${t.approvalStatus} = 'pendiente'`),
    uniqueIndex("uq_seal_eval_pending_affiliate").on(t.affiliateId).where(sql`${t.approvalStatus} = 'pendiente'`),
  ],
);

/** Opt-in del barco al directorio público. */
export const barcoListing = pgTable("barco_listing", {
  id: id(),
  barcoOrgId: uuid("barco_org_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  publicSlug: text("public_slug").notNull().unique(),
  publicBio: text("public_bio"),
  optIn: boolean("opt_in").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Una afiliada propuesta para una necesidad de un barco: firman dos socios y decide el dueño del barco. */
export const specialistProposal = pgTable(
  "specialist_proposal",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // El barco.
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orgNeedId: uuid("org_need_id")
      .notNull()
      .references(() => orgNeed.id, { onDelete: "cascade" }),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliate.id, { onDelete: "cascade" }),
    // Puntaje del Sello al proponer.
    sealScore: integer("seal_score"),
    matchScore: integer("match_score").notNull(),
    status: text("status", { enum: PROPOSAL_STATUSES }).notNull().default("propuesta"),
    firstPartnerId: uuid("first_partner_id").references(() => profile.id),
    secondPartnerId: uuid("second_partner_id").references(() => profile.id),
    partnersApprovedAt: timestamp("partners_approved_at", { withTimezone: true }),
    ownerDecidedBy: uuid("owner_decided_by").references(() => profile.id),
    ownerDecidedAt: timestamp("owner_decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("specialist_proposal_match_range", sql`${t.matchScore} between 0 and 100`),
    check("specialist_proposal_status_check", sql`${t.status} in ('propuesta','aprobada_socios','activa','rechazada')`),
    check("specialist_proposal_otra_firma", sql`${t.secondPartnerId} is null or ${t.secondPartnerId} <> ${t.firstPartnerId}`),
    unique("uq_proposal_need_affiliate").on(t.orgNeedId, t.affiliateId),
    uniqueIndex("uq_proposal_open_need").on(t.orgNeedId).where(sql`${t.status} in ('propuesta','aprobada_socios','activa')`),
  ],
);

// ─── Pacto (blueprint summum-improvement §4) ────────────────────────────────────────────────────
// Hábitos de salud (LFPDPPP, datos sensibles): consentimiento expreso antes del primer registro, y cada
// fila de consentimiento, registro o pausa la lee SOLO su dueño (RLS en la migración pacto_rls).

/** La versión del texto de consentimiento que acepta la persona; súbela cuando cambie el texto. */
export const PACTO_CONSENT_VERSION = 1;

export const pactoConsent = pgTable("pacto_consent", {
  id: id(),
  profileId: uuid("profile_id")
    .notNull()
    .unique()
    .references(() => profile.id, { onDelete: "cascade" }),
  consentTextVersion: integer("consent_text_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Los pilares del Pacto de un muelle, como filas. */
export const pactoPillar = pgTable("pacto_pillar", {
  id: id(),
  muelleOrgId: uuid("muelle_org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const pactoEntry = pgTable(
  "pacto_entry",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    pillarId: uuid("pillar_id")
      .notNull()
      .references(() => pactoPillar.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_pacto_entry_day").on(t.profileId, t.pillarId, t.entryDate)],
);

/** La posada: días en que la racha no se rompe. */
export const pactoPause = pgTable(
  "pacto_pause",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [check("pacto_pause_range", sql`${t.endsOn} >= ${t.startsOn}`)],
);

// ─── Escuadras y retos del Pacto ────────────────────────────────────────────────────────────────
// La escuadra ve a sus miembros y un estado de apoyo (bien / apoyo), nunca registros, notas ni pilares.

export const squad = pgTable("squad", {
  id: id(),
  muelleOrgId: uuid("muelle_org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const squadMember = pgTable(
  "squad_member",
  {
    id: id(),
    squadId: uuid("squad_id")
      .notNull()
      .references(() => squad.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_squad_member").on(t.squadId, t.profileId)],
);

export const challenge = pgTable(
  "challenge",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    squadId: uuid("squad_id").references(() => squad.id, { onDelete: "cascade" }),
    pillarId: uuid("pillar_id").references(() => pactoPillar.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [check("challenge_range", sql`${t.endsOn} >= ${t.startsOn}`)],
);

export const challengeParticipant = pgTable(
  "challenge_participant",
  {
    id: id(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenge.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [unique("uq_challenge_participant").on(t.challengeId, t.profileId)],
);

// ─── Comunidad de la red ────────────────────────────────────────────────────────────────────────
// Feed, calendario y aula de la red de afiliadas: la leen los dueños del muelle y las afiliadas activas.

export const post = pgTable(
  "post",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_post_muelle_created").on(t.muelleOrgId, t.createdAt),
    check("post_body_length", sql`length(${t.body}) between 1 and 4000`),
  ],
);

export const comment = pgTable(
  "comment",
  {
    id: id(),
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("comment_body_length", sql`length(${t.body}) between 1 and 2000`)],
);

export const communityEvent = pgTable(
  "community_event",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    liveUrl: text("live_url"),
    description: text("description").notNull().default(""),
    createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("community_event_range", sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
    check("community_event_live_url_https", sql`${t.liveUrl} is null or ${t.liveUrl} like 'https://%'`),
  ],
);

export const course = pgTable(
  "course",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    minLevel: integer("min_level").notNull().default(1),
    position: integer("position").notNull().default(0),
    published: boolean("published").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("course_min_level_range", sql`${t.minLevel} between 1 and 9`)],
);

export const lesson = pgTable(
  "lesson",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    videoUrl: text("video_url"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("lesson_video_url_https", sql`${t.videoUrl} is null or ${t.videoUrl} like 'https://%'`)],
);

export const lessonCompletion = pgTable(
  "lesson_completion",
  {
    id: id(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [unique("uq_lesson_completion").on(t.lessonId, t.profileId)],
);

// ─── Referidos ──────────────────────────────────────────────────────────────────────────────────
// La comisión se devenga sobre ledger_entry.summum_fee_cents de los barcos referidos y solo se reporta.

export const referralLink = pgTable(
  "referral_link",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_referral_link_profile_muelle").on(t.profileId, t.muelleOrgId)],
);

export const referralAttribution = pgTable(
  "referral_attribution",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    barcoOrgId: uuid("barco_org_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    referralLinkId: uuid("referral_link_id")
      .notNull()
      .references(() => referralLink.id, { onDelete: "restrict" }),
    shareBps: integer("share_bps").notNull(),
    journeyMonths: integer("journey_months").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    proposedBy: uuid("proposed_by")
      .notNull()
      .references(() => profile.id),
    approvedBy: uuid("approved_by").references(() => profile.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("referral_attribution_share_range", sql`${t.shareBps} between 0 and 10000`),
    check("referral_attribution_journey_range", sql`${t.journeyMonths} between 1 and 60`),
    check("referral_attribution_otra_firma", sql`${t.approvedBy} is null or ${t.approvedBy} <> ${t.proposedBy}`),
  ],
);

export const referralCommission = pgTable(
  "referral_commission",
  {
    id: id(),
    attributionId: uuid("attribution_id")
      .notNull()
      .references(() => referralAttribution.id, { onDelete: "restrict" }),
    ledgerEntryId: uuid("ledger_entry_id")
      .notNull()
      .unique()
      .references(() => ledgerEntry.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("referral_commission_amount_nonneg", sql`${t.amountCents} >= 0`)],
);
