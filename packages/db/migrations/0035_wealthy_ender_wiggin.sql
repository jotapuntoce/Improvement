CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"detail" text,
	"severity" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'abierto' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"satisfaction" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_severity_range" CHECK ("ticket"."severity" between 1 and 3),
	CONSTRAINT "ticket_status_check" CHECK ("ticket"."status" in ('abierto','en_proceso','resuelto')),
	CONSTRAINT "ticket_resolved_consistency" CHECK (("ticket"."status" = 'resuelto') = ("ticket"."resolved_at" is not null)),
	CONSTRAINT "ticket_satisfaction_range" CHECK ("ticket"."satisfaction" is null or ("ticket"."satisfaction" between 1 and 5 and "ticket"."status" = 'resuelto'))
);
--> statement-breakpoint
ALTER TABLE "org_kpi" DROP CONSTRAINT "org_kpi_source_check";--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ticket_org_status" ON "ticket" USING btree ("org_id","status");--> statement-breakpoint
ALTER TABLE "org_kpi" ADD CONSTRAINT "org_kpi_source_check" CHECK ("org_kpi"."source" in ('objetivos','puntos','equipo','areas','clientes','manual','proyectos','pendientes','ventas','postventa'));