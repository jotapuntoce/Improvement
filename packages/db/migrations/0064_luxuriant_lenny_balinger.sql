CREATE TABLE "agent_permission" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"mode" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_permission_org_id_user_id_action_pk" PRIMARY KEY("org_id","user_id","action"),
	CONSTRAINT "agent_permission_mode_check" CHECK ("agent_permission"."mode" in ('siempre','primera_vez','solo'))
);
--> statement-breakpoint
CREATE TABLE "automation_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_key" text NOT NULL,
	"name" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"status" text DEFAULT 'prueba' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_rule_status_check" CHECK ("automation_rule"."status" in ('prueba','activa','pausada'))
);
--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	"outcome" text NOT NULL,
	"detail" text NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_run_outcome_check" CHECK ("automation_run"."outcome" in ('hecho','prueba','error','tope'))
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'abierta' NOT NULL,
	"due_at" timestamp with time zone,
	"app_key" text,
	"record_id" uuid,
	"objective_id" uuid,
	"rule_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "task_source_check" CHECK ("task"."source" in ('dueno','propia','improvement','automatizacion')),
	CONSTRAINT "task_status_check" CHECK ("task"."status" in ('abierta','hecha','descartada'))
);
--> statement-breakpoint
CREATE TABLE "task_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"action" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"result" text,
	"done_by" text,
	"done_at" timestamp with time zone,
	CONSTRAINT "task_step_kind_check" CHECK ("task_step"."kind" in ('persona','improvement')),
	CONSTRAINT "task_step_status_check" CHECK ("task_step"."status" in ('pendiente','propuesto','hecho','rechazado')),
	CONSTRAINT "task_step_action_check" CHECK ("task_step"."action" is null or "task_step"."action" in ('crear_registro','mover_etapa','actualizar_campos','nota','borrador_mensaje','recordatorio'))
);
--> statement-breakpoint
ALTER TABLE "agent_permission" ADD CONSTRAINT "agent_permission_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_permission" ADD CONSTRAINT "agent_permission_user_id_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_profile_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_objective_id_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objective"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_step" ADD CONSTRAINT "task_step_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_step" ADD CONSTRAINT "task_step_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_automation_rule_app" ON "automation_rule" USING btree ("org_id","app_key","status");--> statement-breakpoint
CREATE INDEX "idx_automation_run_rule" ON "automation_run" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_automation_run_daily" ON "automation_run" USING btree ("rule_id","record_id","day") WHERE "automation_run"."depth" = 0 and "automation_run"."outcome" <> 'error';--> statement-breakpoint
CREATE INDEX "idx_task_assignee" ON "task" USING btree ("org_id","assignee_id","status");--> statement-breakpoint
CREATE INDEX "idx_task_step_task" ON "task_step" USING btree ("task_id","position");