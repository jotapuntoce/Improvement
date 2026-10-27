CREATE TABLE "chequeo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origen" text NOT NULL,
	"tipo" text NOT NULL,
	"nombre" text,
	"negocio" text,
	"negocio_clave" text,
	"giro" text NOT NULL,
	"ciudad" text NOT NULL,
	"correo" text,
	"telefono" text,
	"canal" text NOT NULL,
	"canal_detalle" text,
	"utm" jsonb,
	"enlaces" jsonb,
	"sin_redes" boolean DEFAULT false NOT NULL,
	"respuestas" jsonb,
	"entrevista_segundos" integer,
	"entrevista_at" timestamp with time zone,
	"clave_hash" text,
	"etapa" text DEFAULT 'registrado' NOT NULL,
	"abre_puerta" text,
	"proxima_accion" text,
	"proxima_fecha" text,
	"notas" text,
	"pdf_path" text,
	"acepta_aviso_at" timestamp with time zone,
	"acepta_correos" boolean DEFAULT false NOT NULL,
	"acepta_correos_at" timestamp with time zone,
	"prospect_client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chequeo_origen_check" CHECK ("chequeo"."origen" in ('landing','propio')),
	CONSTRAINT "chequeo_tipo_check" CHECK ("chequeo"."tipo" in ('negocio','emprendedor')),
	CONSTRAINT "chequeo_canal_check" CHECK ("chequeo"."canal" in ('anuncio_meta','referido','summum','tiktok','youtube','anuncio_google','conferencia','webinar','live','reel','otro')),
	CONSTRAINT "chequeo_etapa_check" CHECK ("chequeo"."etapa" in ('registrado','pedido','entregado','contacto','conversacion','diagnostico','propuesta','cliente','perdido'))
);
--> statement-breakpoint
CREATE TABLE "chequeo_evento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chequeo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"autor" text NOT NULL,
	"detalle" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chequeo_evento_tipo_check" CHECK ("chequeo_evento"."tipo" in ('registro','entrevista','etapa','correo','mensaje','llamada','nota','compra')),
	CONSTRAINT "chequeo_evento_autor_check" CHECK ("chequeo_evento"."autor" in ('prospecto','jose_carlos','improvement'))
);
--> statement-breakpoint
ALTER TABLE "chequeo" ADD CONSTRAINT "chequeo_prospect_client_id_prospect_client_id_fk" FOREIGN KEY ("prospect_client_id") REFERENCES "public"."prospect_client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chequeo_evento" ADD CONSTRAINT "chequeo_evento_chequeo_id_chequeo_id_fk" FOREIGN KEY ("chequeo_id") REFERENCES "public"."chequeo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chequeo_correo" ON "chequeo" USING btree ("correo") WHERE "chequeo"."correo" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chequeo_telefono" ON "chequeo" USING btree ("telefono") WHERE "chequeo"."telefono" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chequeo_negocio_clave" ON "chequeo" USING btree ("negocio_clave") WHERE "chequeo"."negocio_clave" is not null;--> statement-breakpoint
CREATE INDEX "idx_chequeo_evento_chequeo_id" ON "chequeo_evento" USING btree ("chequeo_id");