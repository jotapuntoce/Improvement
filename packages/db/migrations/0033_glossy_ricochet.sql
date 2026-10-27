CREATE TABLE "client_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unmet_note" text,
	"unmet_flagged_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_preference_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'mxn' NOT NULL,
	"stage" text DEFAULT 'prospecto' NOT NULL,
	"owner_profile_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_stage_check" CHECK ("deal"."stage" in ('prospecto','propuesta','negociacion','ganado','perdido')),
	CONSTRAINT "deal_amount_nonneg" CHECK ("deal"."amount_cents" >= 0),
	CONSTRAINT "deal_closed_consistency" CHECK (("deal"."stage" in ('ganado','perdido')) = ("deal"."closed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "ai_suggestion" DROP CONSTRAINT "ai_suggestion_category_check";--> statement-breakpoint
ALTER TABLE "org_kpi" DROP CONSTRAINT "org_kpi_source_check";--> statement-breakpoint
ALTER TABLE "client_preference" ADD CONSTRAINT "client_preference_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_preference" ADD CONSTRAINT "client_preference_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_preference" ADD CONSTRAINT "client_preference_updated_by_profile_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_owner_profile_id_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deal_org_stage" ON "deal" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "idx_deal_client" ON "deal" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_category_check" CHECK ("ai_suggestion"."category" in ('upgrade','servicio_cliente','siguiente_movimiento'));--> statement-breakpoint
ALTER TABLE "org_kpi" ADD CONSTRAINT "org_kpi_source_check" CHECK ("org_kpi"."source" in ('objetivos','puntos','equipo','areas','clientes','manual','proyectos','pendientes','ventas'));