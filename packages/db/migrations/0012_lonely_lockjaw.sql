CREATE TABLE "org_kpi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"label" text NOT NULL,
	"hint" text,
	"source" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manual_value" integer,
	"format" text DEFAULT 'numero' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_kpi_source_check" CHECK ("org_kpi"."source" in ('objetivos','puntos','equipo','areas','clientes','manual')),
	CONSTRAINT "org_kpi_format_check" CHECK ("org_kpi"."format" in ('numero','porcentaje','dinero'))
);
--> statement-breakpoint
ALTER TABLE "org_kpi" ADD CONSTRAINT "org_kpi_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_org_kpi_org_position" ON "org_kpi" USING btree ("org_id","position");