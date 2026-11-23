CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_page_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"status" text DEFAULT 'confirmada' NOT NULL,
	"cancel_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_cancel_token_unique" UNIQUE("cancel_token"),
	CONSTRAINT "booking_status_check" CHECK ("booking"."status" in ('confirmada','cancelada'))
);
--> statement-breakpoint
CREATE TABLE "booking_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"weekly_hours" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_page_slug_unique" UNIQUE("slug"),
	CONSTRAINT "booking_page_duration_check" CHECK ("booking_page"."duration_minutes" between 15 and 240),
	CONSTRAINT "booking_page_slug_format" CHECK ("booking_page"."slug" ~ '^[a-z0-9-]{3,40}$')
);
--> statement-breakpoint
CREATE TABLE "calendar_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_email" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"sync_token" text,
	"status" text DEFAULT 'activa' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connection_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "calendar_connection_status_check" CHECK ("calendar_connection"."status" in ('activa','revocada','error'))
);
--> statement-breakpoint
CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"source" text DEFAULT 'improvement' NOT NULL,
	"google_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_kind_check" CHECK ("calendar_event"."kind" in ('tarea','evento','bloqueo')),
	CONSTRAINT "calendar_event_status_check" CHECK ("calendar_event"."status" in ('pendiente','hecho')),
	CONSTRAINT "calendar_event_source_check" CHECK ("calendar_event"."source" in ('improvement','google','reserva')),
	CONSTRAINT "calendar_event_range_check" CHECK ("calendar_event"."ends_at" > "calendar_event"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_booking_page_id_booking_page_id_fk" FOREIGN KEY ("booking_page_id") REFERENCES "public"."booking_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_page" ADD CONSTRAINT "booking_page_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_page" ADD CONSTRAINT "booking_page_user_id_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_user_id_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_user_id_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_booking_page_slot" ON "booking" USING btree ("booking_page_id","starts_at") WHERE status = 'confirmada';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendar_event_google" ON "calendar_event" USING btree ("user_id","google_event_id") WHERE "calendar_event"."google_event_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_calendar_event_user_starts" ON "calendar_event" USING btree ("user_id","starts_at");