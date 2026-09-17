CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("payment"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "owner_label" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "avatar_path" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "kpi_prefs" jsonb;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_org_id" ON "payment" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_payment_org_due_date" ON "payment" USING btree ("org_id","due_date");