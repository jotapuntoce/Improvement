CREATE TABLE "delegated_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"assigned_to" uuid,
	"area_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"expected_outcome" text,
	"status" text DEFAULT 'sugerida' NOT NULL,
	"owner_review" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"objective_id" uuid,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegated_task_status_check" CHECK ("delegated_task"."status" in ('sugerida','aceptada','rechazada','en_progreso','completada'))
);
--> statement-breakpoint
CREATE TABLE "improvement_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"area_id" uuid,
	"phase" text DEFAULT 'observacion' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"observation" text,
	"inference" text,
	"analysis" text,
	"ai_suggestion" text,
	"owner_decision" text,
	"owner_feedback" text,
	"experiment_start" timestamp with time zone,
	"experiment_end" timestamp with time zone,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "improvement_cycle_phase_check" CHECK ("improvement_cycle"."phase" in ('observacion','inferencia','analisis','sugerencia','decision','experimentacion','medicion','cerrado')),
	CONSTRAINT "improvement_cycle_decision_check" CHECK ("improvement_cycle"."owner_decision" is null or "improvement_cycle"."owner_decision" in ('acepto','rechazo','modificar')),
	CONSTRAINT "improvement_cycle_result_check" CHECK ("improvement_cycle"."result" is null or "improvement_cycle"."result" in ('exitoso','fallido','neutral'))
);
--> statement-breakpoint
CREATE TABLE "improvement_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triggered_by" text DEFAULT 'sistema' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "improvement_event_type_check" CHECK ("improvement_event"."type" in ('observacion','inferencia','analisis','sugerencia','decision','experimentacion','medicion','cerrado')),
	CONSTRAINT "improvement_event_trigger_check" CHECK ("improvement_event"."triggered_by" in ('sistema','dueno','empleado'))
);
--> statement-breakpoint
CREATE TABLE "owner_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"cycle_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_message_role_check" CHECK ("owner_message"."role" in ('dueno','improvement'))
);
--> statement-breakpoint
CREATE TABLE "project_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assigned_to" uuid,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"due_at" timestamp with time zone,
	"estimated_hours" numeric(7, 2),
	"actual_hours" numeric(7, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_task_status_check" CHECK ("project_task"."status" in ('pendiente','por_hacer','en_progreso','revision','hecha'))
);
--> statement-breakpoint
ALTER TABLE "area" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "area" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "last_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "next_follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "deal_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "deal_stage" text DEFAULT 'prospecto' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "budget" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "spent" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "risk" text DEFAULT 'bajo' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "delegated_task" ADD CONSTRAINT "delegated_task_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegated_task" ADD CONSTRAINT "delegated_task_cycle_id_improvement_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."improvement_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegated_task" ADD CONSTRAINT "delegated_task_assigned_to_profile_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegated_task" ADD CONSTRAINT "delegated_task_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegated_task" ADD CONSTRAINT "delegated_task_objective_id_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objective"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_cycle" ADD CONSTRAINT "improvement_cycle_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_cycle" ADD CONSTRAINT "improvement_cycle_owner_id_profile_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_cycle" ADD CONSTRAINT "improvement_cycle_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_event" ADD CONSTRAINT "improvement_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_event" ADD CONSTRAINT "improvement_event_cycle_id_improvement_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."improvement_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_message" ADD CONSTRAINT "owner_message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_message" ADD CONSTRAINT "owner_message_owner_id_profile_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_message" ADD CONSTRAINT "owner_message_cycle_id_improvement_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."improvement_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_assigned_to_profile_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_delegated_task_org_id" ON "delegated_task" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_delegated_task_cycle_id" ON "delegated_task" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_delegated_task_assigned" ON "delegated_task" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "idx_improvement_cycle_org_id" ON "improvement_cycle" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_improvement_cycle_org_phase" ON "improvement_cycle" USING btree ("org_id","phase");--> statement-breakpoint
CREATE INDEX "idx_improvement_event_cycle_id" ON "improvement_event" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_improvement_event_org_id" ON "improvement_event" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_owner_message_org_owner" ON "owner_message" USING btree ("org_id","owner_id");--> statement-breakpoint
CREATE INDEX "idx_owner_message_cycle_id" ON "owner_message" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_project_task_project_id" ON "project_task" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_task_org_status" ON "project_task" USING btree ("org_id","status");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_lead_id_profile_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_client_org_stage" ON "client" USING btree ("org_id","deal_stage");--> statement-breakpoint
ALTER TABLE "area" ADD CONSTRAINT "area_icon_check" CHECK ("area"."icon" is null or "area"."icon" in ('ventas','operaciones','ingenieria','soporte','finanzas','personas','marketing','legal','direccion','otro'));--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_deal_stage_check" CHECK ("client"."deal_stage" in ('prospecto','calificado','propuesta','negociacion','ganado','perdido'));--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_risk_check" CHECK ("project"."risk" in ('bajo','medio','alto'));