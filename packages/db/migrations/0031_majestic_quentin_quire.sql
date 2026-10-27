CREATE TABLE "project_stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stage_weight_range" CHECK ("project_stage"."weight" >= 1 AND "project_stage"."weight" <= 100),
	CONSTRAINT "project_stage_progress_range" CHECK ("project_stage"."progress" >= 0 AND "project_stage"."progress" <= 100),
	CONSTRAINT "project_stage_status_check" CHECK ("project_stage"."status" in ('pendiente','en_curso','terminada'))
);
--> statement-breakpoint
ALTER TABLE "org_kpi" DROP CONSTRAINT "org_kpi_source_check";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "authorization_status" text DEFAULT 'pendiente' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "authorized_by" uuid;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "authorized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "owner_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "project_stage" ADD CONSTRAINT "project_stage_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage" ADD CONSTRAINT "project_stage_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_stage_project_position" ON "project_stage" USING btree ("project_id","position");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_authorized_by_profile_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_profile_id_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_org_authorization" ON "project" USING btree ("org_id","authorization_status");--> statement-breakpoint
ALTER TABLE "org_kpi" ADD CONSTRAINT "org_kpi_source_check" CHECK ("org_kpi"."source" in ('objetivos','puntos','equipo','areas','clientes','manual','proyectos','pendientes'));--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_authorization_check" CHECK ("project"."authorization_status" in ('pendiente','autorizado','rechazado'));