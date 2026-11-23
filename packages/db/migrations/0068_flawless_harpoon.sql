CREATE TABLE "agent_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_message_role_check" CHECK ("agent_message"."role" in ('persona','improvement'))
);
--> statement-breakpoint
ALTER TABLE "dashboard_card" DROP CONSTRAINT "dashboard_card_kind_check";--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_user_id_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_message_user" ON "agent_message" USING btree ("org_id","user_id","created_at");--> statement-breakpoint
ALTER TABLE "dashboard_card" ADD CONSTRAINT "dashboard_card_kind_check" CHECK ("dashboard_card"."kind" in ('numero','barras','embudo','lista','hoy','alertas','momentos','ingresos_meta','pronostico','que_falta','calendario'));