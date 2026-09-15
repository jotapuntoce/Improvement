CREATE TABLE "assembly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assembly_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_id" uuid NOT NULL,
	"from_piece_id" uuid NOT NULL,
	"to_piece_id" uuid NOT NULL,
	"condition_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assembly_connection_no_self_loop" CHECK ("assembly_connection"."from_piece_id" <> "assembly_connection"."to_piece_id")
);
--> statement-breakpoint
CREATE TABLE "assembly_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_id" uuid NOT NULL,
	"piece_id" uuid,
	"actor_id" uuid,
	"event_type" text NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assembly_event_type_check" CHECK ("assembly_event"."event_type" in ('assembly_created','piece_added','piece_updated','piece_removed','connection_added','connection_removed'))
);
--> statement-breakpoint
CREATE TABLE "assembly_piece" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_id" uuid NOT NULL,
	"name" text NOT NULL,
	"what_it_does" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_connection" ADD CONSTRAINT "assembly_connection_assembly_id_assembly_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."assembly"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_connection" ADD CONSTRAINT "assembly_connection_from_piece_id_assembly_piece_id_fk" FOREIGN KEY ("from_piece_id") REFERENCES "public"."assembly_piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_connection" ADD CONSTRAINT "assembly_connection_to_piece_id_assembly_piece_id_fk" FOREIGN KEY ("to_piece_id") REFERENCES "public"."assembly_piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_event" ADD CONSTRAINT "assembly_event_assembly_id_assembly_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."assembly"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_event" ADD CONSTRAINT "assembly_event_piece_id_assembly_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."assembly_piece"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_event" ADD CONSTRAINT "assembly_event_actor_id_profile_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_piece" ADD CONSTRAINT "assembly_piece_assembly_id_assembly_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."assembly"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assembly_org_id" ON "assembly" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_assembly_connection_assembly_id" ON "assembly_connection" USING btree ("assembly_id");--> statement-breakpoint
CREATE INDEX "idx_assembly_connection_from" ON "assembly_connection" USING btree ("from_piece_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assembly_connection_edge" ON "assembly_connection" USING btree ("from_piece_id","to_piece_id");--> statement-breakpoint
CREATE INDEX "idx_assembly_event_assembly_id" ON "assembly_event" USING btree ("assembly_id");--> statement-breakpoint
CREATE INDEX "idx_assembly_piece_assembly_id" ON "assembly_piece" USING btree ("assembly_id");