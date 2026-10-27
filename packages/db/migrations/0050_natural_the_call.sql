CREATE TABLE "seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"area_id" uuid,
	"parent_seat_id" uuid,
	"title" text NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"holder_profile_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_parent_seat_id_seat_id_fk" FOREIGN KEY ("parent_seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_holder_profile_id_profile_id_fk" FOREIGN KEY ("holder_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_seat_org_parent" ON "seat" USING btree ("org_id","parent_seat_id");