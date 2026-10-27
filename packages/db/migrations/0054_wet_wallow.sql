CREATE TABLE "people_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"period_start" date NOT NULL,
	"ratings" jsonb NOT NULL,
	"gwc" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_people_review_period" UNIQUE("org_id","employee_id","period_start")
);
--> statement-breakpoint
ALTER TABLE "people_review" ADD CONSTRAINT "people_review_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_review" ADD CONSTRAINT "people_review_employee_id_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_review" ADD CONSTRAINT "people_review_reviewer_id_profile_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;