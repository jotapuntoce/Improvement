ALTER TABLE "ai_suggestion" DROP CONSTRAINT "ai_suggestion_category_check";--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "theme" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "industry_custom" text;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_category_check" CHECK ("ai_suggestion"."category" in ('upgrade','servicio_cliente','siguiente_movimiento','oficina','agente'));--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_industry_custom_length" CHECK ("organization"."industry_custom" is null or char_length("organization"."industry_custom") between 1 and 80);