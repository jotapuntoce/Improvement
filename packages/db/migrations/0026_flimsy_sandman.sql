CREATE TABLE "fee_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"barco_org_id" uuid,
	"charge_kind" text NOT NULL,
	"percent_bps" integer NOT NULL,
	"fixed_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'mxn' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_fee_rate_scope" UNIQUE NULLS NOT DISTINCT("muelle_org_id","barco_org_id","charge_kind"),
	CONSTRAINT "fee_rate_kind_check" CHECK ("fee_rate"."charge_kind" in ('venta_propia','proyecto_summum')),
	CONSTRAINT "fee_rate_bps_range" CHECK ("fee_rate"."percent_bps" between 0 and 10000),
	CONSTRAINT "fee_rate_fixed_nonneg" CHECK ("fee_rate"."fixed_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fee_rate_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"barco_org_id" uuid,
	"charge_kind" text NOT NULL,
	"percent_bps" integer NOT NULL,
	"fixed_cents" integer DEFAULT 0 NOT NULL,
	"proposed_by" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision" text,
	CONSTRAINT "fee_rate_change_kind_check" CHECK ("fee_rate_change"."charge_kind" in ('venta_propia','proyecto_summum')),
	CONSTRAINT "fee_rate_change_bps_range" CHECK ("fee_rate_change"."percent_bps" between 0 and 10000),
	CONSTRAINT "fee_rate_change_otra_firma" CHECK ("fee_rate_change"."decided_by" is null or "fee_rate_change"."decided_by" <> "fee_rate_change"."proposed_by"),
	CONSTRAINT "fee_rate_change_decision_check" CHECK ("fee_rate_change"."decision" is null or "fee_rate_change"."decision" in ('aprobado','rechazado'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"barco_org_id" uuid NOT NULL,
	"charge_kind" text NOT NULL,
	"gross_cents" bigint NOT NULL,
	"summum_fee_cents" bigint NOT NULL,
	"applied_percent_bps" integer,
	"applied_fixed_cents" integer,
	"currency" text NOT NULL,
	"stripe_object_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entry_stripe_object_id_unique" UNIQUE("stripe_object_id"),
	CONSTRAINT "ledger_entry_kind_check" CHECK ("ledger_entry"."charge_kind" in ('membresia','venta_propia','proyecto_summum')),
	CONSTRAINT "ledger_entry_fee_le_gross" CHECK ("ledger_entry"."summum_fee_cents" between 0 and "ledger_entry"."gross_cents")
);
--> statement-breakpoint
CREATE TABLE "membership_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"monthly_amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'mxn' NOT NULL,
	"stripe_price_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_plan_amount_positive" CHECK ("membership_plan"."monthly_amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_account_id" text,
	"stripe_customer_id" text,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_account_org_id_unique" UNIQUE("org_id"),
	CONSTRAINT "stripe_account_stripe_account_id_unique" UNIQUE("stripe_account_id"),
	CONSTRAINT "stripe_account_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "kind" text DEFAULT 'barco' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "parent_org_id" uuid;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "membership_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_rate" ADD CONSTRAINT "fee_rate_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_rate" ADD CONSTRAINT "fee_rate_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_rate_change" ADD CONSTRAINT "fee_rate_change_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_rate_change" ADD CONSTRAINT "fee_rate_change_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_rate_change" ADD CONSTRAINT "fee_rate_change_proposed_by_profile_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_rate_change" ADD CONSTRAINT "fee_rate_change_decided_by_profile_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan" ADD CONSTRAINT "membership_plan_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_account" ADD CONSTRAINT "stripe_account_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fee_rate_change_muelle" ON "fee_rate_change" USING btree ("muelle_org_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_entry_muelle_created" ON "ledger_entry" USING btree ("muelle_org_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ledger_entry_barco_created" ON "ledger_entry" USING btree ("barco_org_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_membership_plan_muelle" ON "membership_plan" USING btree ("muelle_org_id");--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_parent_org_id_organization_id_fk" FOREIGN KEY ("parent_org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_membership_plan_id_membership_plan_id_fk" FOREIGN KEY ("membership_plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_organization_parent_org_id" ON "organization" USING btree ("parent_org_id");--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_kind_check" CHECK ("organization"."kind" in ('muelle','barco'));--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_muelle_sin_padre" CHECK ("organization"."kind" <> 'muelle' or "organization"."parent_org_id" is null);