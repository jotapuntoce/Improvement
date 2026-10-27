CREATE TABLE "experience_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"value_cents" bigint NOT NULL,
	"granted_on" date NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experience_grant_value_nonneg" CHECK ("experience_grant"."value_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "loyalty_program" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_program_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "loyalty_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_purchases" integer DEFAULT 0 NOT NULL,
	"perks" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_tier_min_purchases_nonneg" CHECK ("loyalty_tier"."min_purchases" >= 0)
);
--> statement-breakpoint
ALTER TABLE "org_kpi" DROP CONSTRAINT "org_kpi_source_check";--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "wallet_token" text;--> statement-breakpoint
ALTER TABLE "experience_grant" ADD CONSTRAINT "experience_grant_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_grant" ADD CONSTRAINT "experience_grant_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_grant" ADD CONSTRAINT "experience_grant_granted_by_profile_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_program" ADD CONSTRAINT "loyalty_program_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_tier" ADD CONSTRAINT "loyalty_tier_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_wallet_token_unique" UNIQUE("wallet_token");--> statement-breakpoint
ALTER TABLE "org_kpi" ADD CONSTRAINT "org_kpi_source_check" CHECK ("org_kpi"."source" in ('objetivos','puntos','equipo','areas','clientes','manual','proyectos','pendientes','ventas','postventa','retorno_experiencias'));