ALTER TABLE "chequeo_evento" DROP CONSTRAINT "chequeo_evento_tipo_check";--> statement-breakpoint
ALTER TABLE "chequeo" ADD COLUMN "motor_estado" text DEFAULT 'sin_empezar' NOT NULL;--> statement-breakpoint
ALTER TABLE "chequeo" ADD COLUMN "motor_error" text;--> statement-breakpoint
ALTER TABLE "chequeo" ADD COLUMN "contenido" jsonb;--> statement-breakpoint
ALTER TABLE "chequeo" ADD COLUMN "notas_internas" jsonb;--> statement-breakpoint
ALTER TABLE "chequeo" ADD COLUMN "etapa_prospecto" text;--> statement-breakpoint
ALTER TABLE "chequeo" ADD COLUMN "fuentes" jsonb;--> statement-breakpoint
ALTER TABLE "chequeo" ADD CONSTRAINT "chequeo_motor_estado_check" CHECK ("chequeo"."motor_estado" in ('sin_empezar','en_fila','armando','borrador','aprobado','error'));--> statement-breakpoint
ALTER TABLE "chequeo" ADD CONSTRAINT "chequeo_etapa_prospecto_check" CHECK ("chequeo"."etapa_prospecto" in ('idea','arrancando','creciendo','consolidado'));--> statement-breakpoint
ALTER TABLE "chequeo_evento" ADD CONSTRAINT "chequeo_evento_tipo_check" CHECK ("chequeo_evento"."tipo" in ('registro','entrevista','etapa','correo','mensaje','llamada','nota','compra','motor'));