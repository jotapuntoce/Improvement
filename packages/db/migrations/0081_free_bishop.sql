CREATE TABLE "purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'mxn' NOT NULL,
	"created_by" uuid,
	"confirmed_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_status_check" CHECK ("purchase_order"."status" in ('borrador','confirmada','recibida','cancelada')),
	CONSTRAINT "purchase_order_total_nonneg" CHECK ("purchase_order"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_cents" bigint NOT NULL,
	CONSTRAINT "purchase_order_line_quantity_pos" CHECK ("purchase_order_line"."quantity" > 0),
	CONSTRAINT "purchase_order_line_cost_nonneg" CHECK ("purchase_order_line"."unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"client_id" uuid,
	"deal_id" uuid,
	"status" text DEFAULT 'borrador' NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'mxn' NOT NULL,
	"created_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_order_status_check" CHECK ("sale_order"."status" in ('borrador','confirmada','entregada','cancelada')),
	CONSTRAINT "sale_order_total_nonneg" CHECK ("sale_order"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sale_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	CONSTRAINT "sale_order_line_quantity_pos" CHECK ("sale_order_line"."quantity" > 0),
	CONSTRAINT "sale_order_line_price_nonneg" CHECK ("sale_order_line"."unit_price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stock_move" ADD COLUMN "sale_order_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_move" ADD COLUMN "purchase_order_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order" ADD CONSTRAINT "sale_order_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order" ADD CONSTRAINT "sale_order_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order" ADD CONSTRAINT "sale_order_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order" ADD CONSTRAINT "sale_order_created_by_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_line" ADD CONSTRAINT "sale_order_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_line" ADD CONSTRAINT "sale_order_line_sale_order_id_sale_order_id_fk" FOREIGN KEY ("sale_order_id") REFERENCES "public"."sale_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_line" ADD CONSTRAINT "sale_order_line_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_order_org_number" ON "purchase_order" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sale_order_org_number" ON "sale_order" USING btree ("org_id","number");--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_sale_order_id_sale_order_id_fk" FOREIGN KEY ("sale_order_id") REFERENCES "public"."sale_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE set null ON UPDATE no action;