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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Mirror local de auth.users de Supabase — fuente de verdad de credenciales vive en Supabase Auth,
// no aquí. id = auth.users.id, nunca generado por Postgres.
export const profile = pgTable("profile", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: createdAt(),
});

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

// Backlog interno de Jose Carlos — FUERA del alcance de RLS multi-tenant (sin org_id todavía cuando
// nace). Solo accesible con la service-role key desde apps/admin, nunca desde apps/improvement.
export const prospectCompany = pgTable(
  "prospect_company",
  {
    id: id(),
    name: text("name").notNull(),
    notes: text("notes"),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("prospecto"),
    orgId: uuid("org_id").references(() => organization.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "prospect_company_status_check",
      sql`${t.status} in ('prospecto','en_construcción','live')`,
    ),
  ],
);
