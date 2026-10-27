CREATE TABLE "barco_listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barco_org_id" uuid NOT NULL,
	"public_slug" text NOT NULL,
	"public_bio" text,
	"opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barco_listing_barco_org_id_unique" UNIQUE("barco_org_id"),
	CONSTRAINT "barco_listing_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE "muelle_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"min_seal_score" integer,
	"grace_days" integer DEFAULT 30 NOT NULL,
	"proposal_min_severity" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "muelle_settings_muelle_org_id_unique" UNIQUE("muelle_org_id"),
	CONSTRAINT "muelle_settings_grace_days_range" CHECK ("muelle_settings"."grace_days" between 1 and 365),
	CONSTRAINT "muelle_settings_min_severity_range" CHECK ("muelle_settings"."proposal_min_severity" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "seal_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"barco_org_id" uuid,
	"affiliate_id" uuid,
	"score" integer NOT NULL,
	"min_score" integer,
	"approval_status" text DEFAULT 'pendiente' NOT NULL,
	"first_approver_id" uuid,
	"second_approver_id" uuid,
	"approved_at" timestamp with time zone,
	"vigencia" text,
	"risk_since" timestamp with time zone,
	"last_computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seal_evaluation_subject_kind_check" CHECK ("seal_evaluation"."subject_kind" in ('barco','afiliada')),
	CONSTRAINT "seal_evaluation_subject" CHECK (("seal_evaluation"."subject_kind" = 'barco' and "seal_evaluation"."barco_org_id" is not null and "seal_evaluation"."affiliate_id" is null) or ("seal_evaluation"."subject_kind" = 'afiliada' and "seal_evaluation"."affiliate_id" is not null and "seal_evaluation"."barco_org_id" is null)),
	CONSTRAINT "seal_evaluation_approval_check" CHECK ("seal_evaluation"."approval_status" in ('pendiente','aprobada','rechazada')),
	CONSTRAINT "seal_evaluation_otra_firma" CHECK ("seal_evaluation"."second_approver_id" is null or "seal_evaluation"."second_approver_id" <> "seal_evaluation"."first_approver_id"),
	CONSTRAINT "seal_evaluation_vigencia_check" CHECK ("seal_evaluation"."vigencia" is null or "seal_evaluation"."vigencia" in ('vigente','en_riesgo','reevaluacion','suspendido'))
);
--> statement-breakpoint
CREATE TABLE "seal_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"points" integer NOT NULL,
	"source" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_seal_requirement_code" UNIQUE("muelle_org_id","code"),
	CONSTRAINT "seal_requirement_points_range" CHECK ("seal_requirement"."points" between 1 and 100),
	CONSTRAINT "seal_requirement_source_check" CHECK ("seal_requirement"."source" in ('manual','kpi'))
);
--> statement-breakpoint
CREATE TABLE "seal_requirement_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"barco_org_id" uuid,
	"affiliate_id" uuid,
	"met" boolean NOT NULL,
	"evidence_note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seal_result_subject_kind_check" CHECK ("seal_requirement_result"."subject_kind" in ('barco','afiliada')),
	CONSTRAINT "seal_result_subject" CHECK (("seal_requirement_result"."subject_kind" = 'barco' and "seal_requirement_result"."barco_org_id" is not null and "seal_requirement_result"."affiliate_id" is null) or ("seal_requirement_result"."subject_kind" = 'afiliada' and "seal_requirement_result"."affiliate_id" is not null and "seal_requirement_result"."barco_org_id" is null))
);
--> statement-breakpoint
CREATE TABLE "specialist_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muelle_org_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"org_need_id" uuid NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"seal_score" integer,
	"match_score" integer NOT NULL,
	"status" text DEFAULT 'propuesta' NOT NULL,
	"first_partner_id" uuid,
	"second_partner_id" uuid,
	"partners_approved_at" timestamp with time zone,
	"owner_decided_by" uuid,
	"owner_decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_proposal_need_affiliate" UNIQUE("org_need_id","affiliate_id"),
	CONSTRAINT "specialist_proposal_match_range" CHECK ("specialist_proposal"."match_score" between 0 and 100),
	CONSTRAINT "specialist_proposal_status_check" CHECK ("specialist_proposal"."status" in ('propuesta','aprobada_socios','activa','rechazada')),
	CONSTRAINT "specialist_proposal_otra_firma" CHECK ("specialist_proposal"."second_partner_id" is null or "specialist_proposal"."second_partner_id" <> "specialist_proposal"."first_partner_id")
);
--> statement-breakpoint
ALTER TABLE "barco_listing" ADD CONSTRAINT "barco_listing_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muelle_settings" ADD CONSTRAINT "muelle_settings_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_evaluation" ADD CONSTRAINT "seal_evaluation_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_evaluation" ADD CONSTRAINT "seal_evaluation_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_evaluation" ADD CONSTRAINT "seal_evaluation_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_evaluation" ADD CONSTRAINT "seal_evaluation_first_approver_id_profile_id_fk" FOREIGN KEY ("first_approver_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_evaluation" ADD CONSTRAINT "seal_evaluation_second_approver_id_profile_id_fk" FOREIGN KEY ("second_approver_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_requirement" ADD CONSTRAINT "seal_requirement_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_requirement_result" ADD CONSTRAINT "seal_requirement_result_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_requirement_result" ADD CONSTRAINT "seal_requirement_result_requirement_id_seal_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."seal_requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_requirement_result" ADD CONSTRAINT "seal_requirement_result_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_requirement_result" ADD CONSTRAINT "seal_requirement_result_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_requirement_result" ADD CONSTRAINT "seal_requirement_result_decided_by_profile_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_proposal" ADD CONSTRAINT "specialist_proposal_muelle_org_id_organization_id_fk" FOREIGN KEY ("muelle_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_proposal" ADD CONSTRAINT "specialist_proposal_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_proposal" ADD CONSTRAINT "specialist_proposal_org_need_id_org_need_id_fk" FOREIGN KEY ("org_need_id") REFERENCES "public"."org_need"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_proposal" ADD CONSTRAINT "specialist_proposal_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_proposal" ADD CONSTRAINT "specialist_proposal_first_partner_id_profile_id_fk" FOREIGN KEY ("first_partner_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_proposal" ADD CONSTRAINT "specialist_proposal_second_partner_id_profile_id_fk" FOREIGN KEY ("second_partner_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_proposal" ADD CONSTRAINT "specialist_proposal_owner_decided_by_profile_id_fk" FOREIGN KEY ("owner_decided_by") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_seal_eval_pending_barco" ON "seal_evaluation" USING btree ("barco_org_id") WHERE "seal_evaluation"."approval_status" = 'pendiente';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_seal_eval_pending_affiliate" ON "seal_evaluation" USING btree ("affiliate_id") WHERE "seal_evaluation"."approval_status" = 'pendiente';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_seal_result_barco" ON "seal_requirement_result" USING btree ("requirement_id","barco_org_id") WHERE "seal_requirement_result"."barco_org_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_seal_result_affiliate" ON "seal_requirement_result" USING btree ("requirement_id","affiliate_id") WHERE "seal_requirement_result"."affiliate_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_proposal_open_need" ON "specialist_proposal" USING btree ("org_need_id") WHERE "specialist_proposal"."status" in ('propuesta','aprobada_socios','activa');