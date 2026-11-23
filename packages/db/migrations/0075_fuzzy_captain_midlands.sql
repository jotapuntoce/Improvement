CREATE TABLE "agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"area_id" uuid,
	"owner_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_report_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_kind_check" CHECK ("agent"."kind" in ('manager','especialista','recepcion')),
	CONSTRAINT "agent_area_kind_check" CHECK (("agent"."kind" = 'especialista') = ("agent"."area_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "agent_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid,
	"requested_by" uuid,
	"area_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'recibido' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_task_status_check" CHECK ("agent_task"."status" in ('recibido','asignado','en_proceso','hecho','fallido')),
	CONSTRAINT "agent_task_attempts_range" CHECK ("agent_task"."attempts" between 0 and 3),
	CONSTRAINT "agent_task_body_length" CHECK (char_length("agent_task"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeat" (
	"worker" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_owner_profile_id_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_requested_by_profile_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_org_manager" ON "agent" USING btree ("org_id") WHERE "agent"."kind" = 'manager';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_org_recepcion" ON "agent" USING btree ("org_id") WHERE "agent"."kind" = 'recepcion';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_area" ON "agent" USING btree ("area_id") WHERE "agent"."kind" = 'especialista';--> statement-breakpoint
CREATE INDEX "idx_agent_task_status_lock" ON "agent_task" USING btree ("status","locked_until");