CREATE TABLE "permission_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"grants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "permission_type_id" uuid;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "permission_type_id" uuid;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "responsibilities" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "section_labels" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "permission_type" ADD CONSTRAINT "permission_type_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_permission_type_org_id" ON "permission_type" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_permission_type_org_name" ON "permission_type" USING btree ("org_id","name");--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_permission_type_id_permission_type_id_fk" FOREIGN KEY ("permission_type_id") REFERENCES "public"."permission_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_permission_type_id_permission_type_id_fk" FOREIGN KEY ("permission_type_id") REFERENCES "public"."permission_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;