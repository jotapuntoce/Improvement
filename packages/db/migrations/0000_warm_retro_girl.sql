CREATE TABLE "ai_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category" text NOT NULL,
	"suggestion_text" text NOT NULL,
	"based_on" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_suggestion_category_check" CHECK ("ai_suggestion"."category" in ('upgrade','servicio_cliente'))
);
--> statement-breakpoint
CREATE TABLE "area" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"health_status" text DEFAULT 'neutral' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_health_status_check" CHECK ("client"."health_status" in ('healthy','neutral','at_risk'))
);
--> statement-breakpoint
CREATE TABLE "employee_points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_role_check" CHECK ("invitation"."role" in ('owner','employee'))
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"model_id" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL,
	"finish_reason" text NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" text NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "membership_role_check" CHECK ("membership"."role" in ('owner','employee'))
);
--> statement-breakpoint
CREATE TABLE "objective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"area_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"impact_weight" integer NOT NULL,
	"assigned_employee_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_impact_weight_range" CHECK ("objective"."impact_weight" >= 0 AND "objective"."impact_weight" <= 100),
	CONSTRAINT "objective_status_check" CHECK ("objective"."status" in ('pending','in_progress','completed'))
);
--> statement-breakpoint
CREATE TABLE "org_build_stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stage_order" integer NOT NULL,
	"stage_name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'bloqueada' NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "org_build_stage_status_check" CHECK ("org_build_stage"."status" in ('bloqueada','en_progreso','completada'))
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "powerup_partner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"category" text NOT NULL,
	"discount_description" text NOT NULL,
	"redemption_instructions" text NOT NULL,
	"points_cost" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "powerup_redemption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"points_spent" integer NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'redeemed' NOT NULL,
	CONSTRAINT "powerup_redemption_status_check" CHECK ("powerup_redemption"."status" in ('redeemed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'prospecto' NOT NULL,
	"org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_company_status_check" CHECK ("prospect_company"."status" in ('prospecto','en_construcción','live'))
);
--> statement-breakpoint
CREATE TABLE "reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"objective_id" uuid,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"channel" text NOT NULL,
	CONSTRAINT "reminder_channel_check" CHECK ("reminder"."channel" in ('in_app','email'))
);
--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area" ADD CONSTRAINT "area_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_points_ledger" ADD CONSTRAINT "employee_points_ledger_employee_id_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_points_ledger" ADD CONSTRAINT "employee_points_ledger_objective_id_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objective"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_points_ledger" ADD CONSTRAINT "employee_points_ledger_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_invited_by_profile_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_assigned_employee_id_profile_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_build_stage" ADD CONSTRAINT "org_build_stage_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "powerup_redemption" ADD CONSTRAINT "powerup_redemption_employee_id_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "powerup_redemption" ADD CONSTRAINT "powerup_redemption_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "powerup_redemption" ADD CONSTRAINT "powerup_redemption_partner_id_powerup_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."powerup_partner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_company" ADD CONSTRAINT "prospect_company_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_objective_id_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objective"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_suggestion_org_id" ON "ai_suggestion" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_area_org_id" ON "area" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_client_org_id" ON "client" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_employee_points_ledger_employee_id" ON "employee_points_ledger" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_employee_points_ledger_org_id" ON "employee_points_ledger" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_llm_calls_org_id" ON "llm_calls" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_membership_user_org" ON "membership" USING btree ("user_id","org_id");--> statement-breakpoint
CREATE INDEX "idx_membership_user_id" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_membership_org_id" ON "membership" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_objective_org_id" ON "objective" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_objective_assignee_status" ON "objective" USING btree ("assigned_employee_id","status");--> statement-breakpoint
CREATE INDEX "idx_objective_org_due_date" ON "objective" USING btree ("org_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_org_build_stage_org_order" ON "org_build_stage" USING btree ("org_id","stage_order");--> statement-breakpoint
CREATE INDEX "idx_powerup_redemption_org_id" ON "powerup_redemption" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_reminder_org_id" ON "reminder" USING btree ("org_id");