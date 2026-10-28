CREATE TABLE "app_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"title" text NOT NULL,
	"stage" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_profile" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"team_size" text,
	"city" text,
	"template_key" text,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_profile_team_size_check" CHECK ("org_profile"."team_size" is null or "org_profile"."team_size" in ('solo','2-5','6-20','21+'))
);
--> statement-breakpoint
ALTER TABLE "app_record" ADD CONSTRAINT "app_record_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_record" ADD CONSTRAINT "app_record_app_id_app_model_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_record" ADD CONSTRAINT "app_record_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_profile" ADD CONSTRAINT "org_profile_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_app_record_app" ON "app_record" USING btree ("app_id","updated_at");