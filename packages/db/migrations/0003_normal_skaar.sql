CREATE TABLE "prospect_client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"whatsapp_phone" text NOT NULL,
	"company_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect_company" ADD COLUMN "prospect_client_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_company" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "prospect_company" ADD CONSTRAINT "prospect_company_prospect_client_id_prospect_client_id_fk" FOREIGN KEY ("prospect_client_id") REFERENCES "public"."prospect_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_prospect_company_client_id" ON "prospect_company" USING btree ("prospect_client_id");