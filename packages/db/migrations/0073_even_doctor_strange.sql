CREATE TABLE "office_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"proposal" jsonb NOT NULL,
	"logo" jsonb,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_plan_status_check" CHECK ("office_plan"."status" in ('draft','confirmed')),
	CONSTRAINT "office_plan_photos_max" CHECK (cardinality("office_plan"."source_photos") <= 6)
);
--> statement-breakpoint
CREATE TABLE "office_zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"area_id" uuid,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"w" integer NOT NULL,
	"h" integer NOT NULL,
	CONSTRAINT "office_zone_kind_check" CHECK ("office_zone"."kind" in ('area','recepcion','direccion','sala')),
	CONSTRAINT "office_zone_grid_check" CHECK ("office_zone"."x" >= 0 and "office_zone"."y" >= 0 and "office_zone"."w" >= 1 and "office_zone"."h" >= 1 and "office_zone"."x" + "office_zone"."w" <= 40 and "office_zone"."y" + "office_zone"."h" <= 24),
	CONSTRAINT "office_zone_area_kind_check" CHECK (("office_zone"."kind" = 'area') = ("office_zone"."area_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "office_plan" ADD CONSTRAINT "office_plan_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_plan" ADD CONSTRAINT "office_plan_confirmed_by_profile_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_plan" ADD CONSTRAINT "office_plan_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_zone" ADD CONSTRAINT "office_zone_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_zone" ADD CONSTRAINT "office_zone_plan_id_office_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."office_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_zone" ADD CONSTRAINT "office_zone_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_office_plan_org_status" ON "office_plan" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_office_zone_plan" ON "office_zone" USING btree ("plan_id");