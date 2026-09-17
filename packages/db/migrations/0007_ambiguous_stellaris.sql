CREATE TABLE "company_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"industry" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"org_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_request_status_check" CHECK ("company_request"."status" in ('pending','approved','rejected'))
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "company_request" ADD CONSTRAINT "company_request_requester_id_profile_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_request" ADD CONSTRAINT "company_request_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_request" ADD CONSTRAINT "company_request_reviewed_by_profile_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_company_request_requester_id" ON "company_request" USING btree ("requester_id");