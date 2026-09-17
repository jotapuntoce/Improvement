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
    assignedEmployeeId: uuid("assigned_employee_id").references(() => profile.id),
    status: text("status").notNull().default("pending"),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("objective_impact_weight_range", sql`${t.impactWeight} >= 0 AND ${t.impactWeight} <= 100`),
    check("objective_status_check", sql`${t.status} in ('pending','in_progress','completed')`),
    index("idx_objective_org_id").on(t.orgId),
    index("idx_objective_assignee_status").on(t.assignedEmployeeId, t.status),
    index("idx_objective_org_due_date").on(t.orgId, t.dueDate),
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_client_org_id").on(t.orgId),
    check("client_health_status_check", sql`${t.healthStatus} in ('healthy','neutral','at_risk')`),
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
