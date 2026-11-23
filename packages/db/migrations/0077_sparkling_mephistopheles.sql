CREATE TABLE "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"area_id" uuid,
	"agent_id" uuid,
	"profile_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_kind_check" CHECK ("channel"."kind" in ('general','area','directo','agente')),
	CONSTRAINT "channel_agent_kind_check" CHECK (("channel"."kind" = 'agente') = ("channel"."agent_id" is not null and "channel"."profile_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "channel_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_profile_id" uuid,
	"author_agent_id" uuid,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_one_author_check" CHECK (num_nonnulls("message"."author_profile_id", "message"."author_agent_id") = 1),
	CONSTRAINT "message_deleted_blank_check" CHECK ("message"."deleted_at" is null or "message"."body" = ''),
	CONSTRAINT "message_body_length" CHECK (char_length("message"."body") <= 4000)
);
--> statement-breakpoint
ALTER TABLE "agent_task" ADD COLUMN "channel_id" uuid;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_profile_id_profile_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_agent_id_agent_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_org_general" ON "channel" USING btree ("org_id") WHERE "channel"."kind" = 'general';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_agent_profile" ON "channel" USING btree ("agent_id","profile_id") WHERE "channel"."kind" = 'agente';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_member" ON "channel_member" USING btree ("channel_id","profile_id");--> statement-breakpoint
CREATE INDEX "idx_message_channel_created" ON "message" USING btree ("channel_id","created_at");--> statement-breakpoint
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;