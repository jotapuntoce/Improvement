CREATE TABLE "referral_attribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"barco_org_id" uuid NOT NULL,
	"referral_link_id" uuid NOT NULL,
	"share_bps" integer NOT NULL,
	"journey_months" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"proposed_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_attribution_barco_org_id_unique" UNIQUE("barco_org_id"),
	CONSTRAINT "referral_attribution_share_range" CHECK ("referral_attribution"."share_bps" between 0 and 10000),
	CONSTRAINT "referral_attribution_journey_range" CHECK ("referral_attribution"."journey_months" between 1 and 60),
	CONSTRAINT "referral_attribution_otra_firma" CHECK ("referral_attribution"."approved_by" is null or "referral_attribution"."approved_by" <> "referral_attribution"."proposed_by")
);
--> statement-breakpoint
CREATE TABLE "referral_commission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attribution_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_commission_ledger_entry_id_unique" UNIQUE("ledger_entry_id"),
	CONSTRAINT "referral_commission_amount_nonneg" CHECK ("referral_commission"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "referral_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_link_code_unique" UNIQUE("code"),
	CONSTRAINT "uq_referral_link_profile_muelle" UNIQUE("profile_id","muelle_org_id")
);
--> statement-breakpoint
ALTER TABLE "referral_attribution" ADD CONSTRAINT "referral_attribution_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attribution" ADD CONSTRAINT "referral_attribution_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attribution" ADD CONSTRAINT "referral_attribution_referral_link_id_referral_link_id_fk" FOREIGN KEY ("referral_link_id") REFERENCES "public"."referral_link"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attribution" ADD CONSTRAINT "referral_attribution_proposed_by_profile_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attribution" ADD CONSTRAINT "referral_attribution_approved_by_profile_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commission" ADD CONSTRAINT "referral_commission_attribution_id_referral_attribution_id_fk" FOREIGN KEY ("attribution_id") REFERENCES "public"."referral_attribution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commission" ADD CONSTRAINT "referral_commission_ledger_entry_id_ledger_entry_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_link" ADD CONSTRAINT "referral_link_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_link" ADD CONSTRAINT "referral_link_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;