CREATE TABLE "measurable_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"measurable_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"entered_by" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_measurable_value_week" UNIQUE("measurable_id","week_start"),
	CONSTRAINT "measurable_value_monday" CHECK (extract(isodow from "measurable_value"."week_start") = 1)
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"facilitator_profile_id" uuid,
	"current_block" text,
	"notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_block_check" CHECK ("meeting"."current_block" is null or "meeting"."current_block" in ('segue','scorecard','rocks','headlines','todos','ids','conclude')),
	CONSTRAINT "meeting_end_after_start" CHECK ("meeting"."ended_at" is null or ("meeting"."started_at" is not null and "meeting"."ended_at" >= "meeting"."started_at"))
);
--> statement-breakpoint
CREATE TABLE "meeting_rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_meeting_rating_person" UNIQUE("meeting_id","profile_id"),
	CONSTRAINT "meeting_rating_range" CHECK ("meeting_rating"."rating" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "org_measurable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"goal" numeric(14, 2) NOT NULL,
	"goal_direction" text NOT NULL,
	"unit" text DEFAULT 'numero' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_measurable_direction_check" CHECK ("org_measurable"."goal_direction" in ('gte','lte')),
	CONSTRAINT "org_measurable_unit_check" CHECK ("org_measurable"."unit" in ('numero','porcentaje','dinero'))
);
--> statement-breakpoint
CREATE TABLE "org_vision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"core_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"core_focus" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ten_year_target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"marketing_strategy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"three_year_picture" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"one_year_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_vision_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "org_need" ADD COLUMN "owner_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "org_need" ADD COLUMN "priority_week" date;--> statement-breakpoint
ALTER TABLE "measurable_value" ADD CONSTRAINT "measurable_value_measurable_id_org_measurable_id_fk" FOREIGN KEY ("measurable_id") REFERENCES "public"."org_measurable"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurable_value" ADD CONSTRAINT "measurable_value_entered_by_profile_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_facilitator_profile_id_profile_id_fk" FOREIGN KEY ("facilitator_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rating" ADD CONSTRAINT "meeting_rating_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rating" ADD CONSTRAINT "meeting_rating_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_measurable" ADD CONSTRAINT "org_measurable_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_measurable" ADD CONSTRAINT "org_measurable_owner_profile_id_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_vision" ADD CONSTRAINT "org_vision_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_vision" ADD CONSTRAINT "org_vision_updated_by_profile_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_meeting_org_scheduled" ON "meeting" USING btree ("org_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_meeting_org_ended" ON "meeting" USING btree ("org_id","ended_at");--> statement-breakpoint
CREATE INDEX "idx_org_measurable_org_position" ON "org_measurable" USING btree ("org_id","position");--> statement-breakpoint
ALTER TABLE "org_need" ADD CONSTRAINT "org_need_owner_profile_id_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_org_need_org_priority" ON "org_need" USING btree ("org_id","priority_week");