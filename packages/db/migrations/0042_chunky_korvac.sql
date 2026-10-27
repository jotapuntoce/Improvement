CREATE TABLE "pacto_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"consent_text_version" integer NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pacto_consent_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "pacto_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"pillar_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_pacto_entry_day" UNIQUE("profile_id","pillar_id","entry_date")
);
--> statement-breakpoint
CREATE TABLE "pacto_pause" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pacto_pause_range" CHECK ("pacto_pause"."ends_on" >= "pacto_pause"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "pacto_pillar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pacto_consent" ADD CONSTRAINT "pacto_consent_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacto_entry" ADD CONSTRAINT "pacto_entry_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacto_entry" ADD CONSTRAINT "pacto_entry_pillar_id_pacto_pillar_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "public"."pacto_pillar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacto_pause" ADD CONSTRAINT "pacto_pause_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacto_pillar" ADD CONSTRAINT "pacto_pillar_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;