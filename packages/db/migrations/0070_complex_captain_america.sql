CREATE TABLE "agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invitation_id" uuid,
	"user_id" uuid,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"puesto" text NOT NULL,
	"sucursal" text,
	"encargos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"respuestas" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agente" ADD CONSTRAINT "agente_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agente" ADD CONSTRAINT "agente_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agente" ADD CONSTRAINT "agente_user_id_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agente_org_email" ON "agente" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "idx_agente_user" ON "agente" USING btree ("user_id");