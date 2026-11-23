CREATE TABLE "dashboard_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_card_kind_check" CHECK ("dashboard_card"."kind" in ('numero','barras','embudo','lista','hoy','alertas','momentos','ingresos_meta','pronostico','que_falta'))
);
--> statement-breakpoint
ALTER TABLE "ai_suggestion" DROP CONSTRAINT "ai_suggestion_category_check";--> statement-breakpoint
ALTER TABLE "dashboard_card" ADD CONSTRAINT "dashboard_card_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_card" ADD CONSTRAINT "dashboard_card_user_id_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dashboard_card_user" ON "dashboard_card" USING btree ("org_id","user_id","position");--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_category_check" CHECK ("ai_suggestion"."category" in ('upgrade','servicio_cliente','siguiente_movimiento','alerta'));