ALTER TABLE "muelle_settings" ADD COLUMN "catalog_mode" text DEFAULT 'global' NOT NULL;--> statement-breakpoint
ALTER TABLE "powerup_partner" ADD COLUMN "network_org_id" uuid;--> statement-breakpoint
ALTER TABLE "powerup_partner" ADD COLUMN "affiliate_id" uuid;--> statement-breakpoint
ALTER TABLE "powerup_partner" ADD COLUMN "barco_org_id" uuid;--> statement-breakpoint
ALTER TABLE "powerup_partner" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "powerup_partner" ADD CONSTRAINT "powerup_partner_network_org_id_organization_id_fk" FOREIGN KEY ("network_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "powerup_partner" ADD CONSTRAINT "powerup_partner_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "powerup_partner" ADD CONSTRAINT "powerup_partner_barco_org_id_organization_id_fk" FOREIGN KEY ("barco_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "powerup_partner" ADD CONSTRAINT "powerup_partner_published_by_profile_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_powerup_partner_network" ON "powerup_partner" USING btree ("network_org_id","is_active");--> statement-breakpoint
ALTER TABLE "muelle_settings" ADD CONSTRAINT "muelle_settings_catalog_check" CHECK ("muelle_settings"."catalog_mode" in ('global','red'));