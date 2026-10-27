CREATE TABLE "checkin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"mood" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_checkin_week" UNIQUE("org_id","profile_id","week_start"),
	CONSTRAINT "checkin_monday" CHECK (extract(isodow from "checkin"."week_start") = 1),
	CONSTRAINT "checkin_mood_range" CHECK ("checkin"."mood" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "one_on_one" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"held_by" uuid,
	"held_on" date NOT NULL,
	"shared_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_on_one" ADD CONSTRAINT "one_on_one_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_on_one" ADD CONSTRAINT "one_on_one_employee_id_profile_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_on_one" ADD CONSTRAINT "one_on_one_held_by_profile_id_fk" FOREIGN KEY ("held_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;