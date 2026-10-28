CREATE TABLE "import_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"source" text NOT NULL,
	"file_name" text NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"headers" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mapped_by" text,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	CONSTRAINT "import_job_source_check" CHECK ("import_job"."source" in ('csv','xlsx','sheets','pdf','imagen')),
	CONSTRAINT "import_job_status_check" CHECK ("import_job"."status" in ('borrador','importado','deshecho')),
	CONSTRAINT "import_job_mapped_by_check" CHECK ("import_job"."mapped_by" is null or "import_job"."mapped_by" in ('ia','nombre'))
);
--> statement-breakpoint
CREATE TABLE "record_origin" (
	"import_job_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	CONSTRAINT "record_origin_import_job_id_record_id_pk" PRIMARY KEY("import_job_id","record_id")
);
--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_app_id_app_model_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_origin" ADD CONSTRAINT "record_origin_import_job_id_import_job_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_origin" ADD CONSTRAINT "record_origin_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_import_job_app" ON "import_job" USING btree ("app_id","created_at");