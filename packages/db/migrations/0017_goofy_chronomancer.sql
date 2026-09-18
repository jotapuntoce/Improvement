CREATE TABLE "org_need" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"area_id" uuid,
	"title" text NOT NULL,
	"detail" text,
	"severity" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'abierta' NOT NULL,
	"source" text DEFAULT 'improvement' NOT NULL,
	"referred_at" timestamp with time zone,
	"referral_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_need_severity_range" CHECK ("org_need"."severity" >= 1 AND "org_need"."severity" <= 3),
	CONSTRAINT "org_need_status_check" CHECK ("org_need"."status" in ('abierta','en_progreso','resuelta','derivada')),
	CONSTRAINT "org_need_source_check" CHECK ("org_need"."source" in ('improvement','dueno'))
);
--> statement-breakpoint
CREATE TABLE "owner_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"question" text,
	"answer" text NOT NULL,
	"topic" text DEFAULT 'arranque' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_memory_topic_check" CHECK ("owner_memory"."topic" in ('arranque','observacion'))
);
--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "kind" text DEFAULT 'non_ipa' NOT NULL;--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "evidence_type" text DEFAULT 'ninguna' NOT NULL;--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "evidence_value" text;--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "evidence_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "review_status" text DEFAULT 'sin_revisar' NOT NULL;--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "objective" ADD COLUMN "need_id" uuid;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "evolution_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_need" ADD CONSTRAINT "org_need_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_need" ADD CONSTRAINT "org_need_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_memory" ADD CONSTRAINT "owner_memory_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_memory" ADD CONSTRAINT "owner_memory_owner_id_profile_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_org_need_org_id" ON "org_need" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_org_need_org_status" ON "org_need" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_owner_memory_org_id" ON "owner_memory" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_owner_memory_owner_id" ON "owner_memory" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_need_id_org_need_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."org_need"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_kind_check" CHECK ("objective"."kind" in ('ipa','non_ipa'));--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_evidence_type_check" CHECK ("objective"."evidence_type" in ('ninguna','enlace','nota','numero','archivo'));--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_review_status_check" CHECK ("objective"."review_status" in ('sin_revisar','aprobada','rechazada'));