ALTER TABLE "improvement_cycle" ADD COLUMN "root_cause" text;--> statement-breakpoint
ALTER TABLE "improvement_cycle" ADD COLUMN "cause_category" text;--> statement-breakpoint
ALTER TABLE "improvement_cycle" ADD COLUMN "whys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "improvement_cycle" ADD COLUMN "contributing_factors" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "improvement_cycle" ADD COLUMN "verification" text;--> statement-breakpoint
ALTER TABLE "improvement_cycle" ADD CONSTRAINT "improvement_cycle_cause_category_check" CHECK ("improvement_cycle"."cause_category" is null or "improvement_cycle"."cause_category" in ('personas','metodos','maquinas','materiales','medio_ambiente','medicion'));