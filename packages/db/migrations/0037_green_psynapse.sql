CREATE TABLE "affiliate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"barco_org_id" uuid,
	"display_name" text NOT NULL,
	"specialty_keys" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'activa' NOT NULL,
	"public_slug" text NOT NULL,
	"public_bio" text,
	"directory_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_public_slug_unique" UNIQUE("public_slug"),
	CONSTRAINT "uq_affiliate_profile_muelle" UNIQUE("profile_id","muelle_org_id"),
	CONSTRAINT "affiliate_status_check" CHECK ("affiliate"."status" in ('activa','suspendida'))
);
--> statement-breakpoint
CREATE TABLE "personality_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"org_id" uuid,
	"answers" jsonb NOT NULL,
	"questionnaire_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_personality_profile_subject" UNIQUE("profile_id","subject_kind"),
	CONSTRAINT "personality_subject_check" CHECK ("personality_profile"."subject_kind" in ('afiliada','dueno'))
);
--> statement-breakpoint
CREATE TABLE "specialty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_specialty_muelle_key" UNIQUE("muelle_org_id","key")
);
--> statement-breakpoint
ALTER TABLE "area" ADD COLUMN "specialty_key" text;--> statement-breakpoint
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_profile" ADD CONSTRAINT "personality_profile_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_profile" ADD CONSTRAINT "personality_profile_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialty" ADD CONSTRAINT "specialty_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;