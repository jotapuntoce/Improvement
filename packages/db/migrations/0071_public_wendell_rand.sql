CREATE TABLE "seat_booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"status" text NOT NULL,
	"hold_token" uuid,
	"hold_expires_at" timestamp with time zone,
	"price_cents" bigint NOT NULL,
	"buyer_name" text,
	"buyer_email" text,
	"channel" text NOT NULL,
	"stripe_checkout_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_seat_booking_session_seat" UNIQUE("session_id","seat_id"),
	CONSTRAINT "seat_booking_status_check" CHECK ("seat_booking"."status" in ('held','sold','released')),
	CONSTRAINT "seat_booking_channel_check" CHECK ("seat_booking"."channel" in ('web','taquilla')),
	CONSTRAINT "seat_booking_price_check" CHECK ("seat_booking"."price_cents" >= 0),
	CONSTRAINT "seat_booking_hold_check" CHECK ("seat_booking"."status" <> 'held' or ("seat_booking"."hold_token" is not null and "seat_booking"."hold_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "venue_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"layout" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_map_kind_check" CHECK ("venue_map"."kind" in ('teatro','restaurante','antro','bodas','eventos','lotes'))
);
--> statement-breakpoint
CREATE TABLE "venue_seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"label" text NOT NULL,
	"section" text,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"kind" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "venue_seat_kind_check" CHECK ("venue_seat"."kind" in ('butaca','mesa','lugar','lote')),
	CONSTRAINT "venue_seat_capacity_check" CHECK ("venue_seat"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "venue_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"price_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_session_status_check" CHECK ("venue_session"."status" in ('borrador','a_la_venta','cerrada')),
	CONSTRAINT "venue_session_price_check" CHECK ("venue_session"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "seat_booking" ADD CONSTRAINT "seat_booking_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD CONSTRAINT "seat_booking_session_id_venue_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."venue_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD CONSTRAINT "seat_booking_seat_id_venue_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."venue_seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_map" ADD CONSTRAINT "venue_map_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_seat" ADD CONSTRAINT "venue_seat_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_seat" ADD CONSTRAINT "venue_seat_map_id_venue_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."venue_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_session" ADD CONSTRAINT "venue_session_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_session" ADD CONSTRAINT "venue_session_map_id_venue_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."venue_map"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_seat_booking_hold_token" ON "seat_booking" USING btree ("hold_token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_venue_seat_map_label" ON "venue_seat" USING btree ("map_id","label");