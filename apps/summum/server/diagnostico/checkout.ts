// Cobro del Diagnóstico Súmmum 360: Checkout de Stripe en la cuenta de la plataforma (no de un barco).
// Los datos de la solicitud viajan como metadata del pago; no hay tabla propia todavía.
// ponytail: sin tabla de solicitudes; si hace falta seguimiento fuera de Stripe, se agrega con su RLS.
import type Stripe from "stripe";
import { z } from "zod";
import type { Result } from "@/server/result.ts";

/** $7,500 MXN en centavos. Se abona al primer servicio si el cliente avanza después del diagnóstico. */
export const DIAGNOSTICO_CENTAVOS = 750_000;

export type DiagnosticoDeps = { stripe: Pick<Stripe, "checkout">; baseUrl: string };

const texto = (max: number) => z.string().trim().min(1).max(max);
export const SOLICITUD = z.object({
  nombre: texto(120),
  negocio: texto(160),
  correo: z.string().trim().email().max(200),
  telefono: z.string().trim().min(8).max(30),
  perfil: z.enum(["dueno", "emprendedor"]),
  frena: texto(480),
});

export async function crearCobroDiagnostico(input: unknown, deps: DiagnosticoDeps): Promise<Result<{ url: string }>> {
  const parsed = SOLICITUD.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos del formulario." };
  const d = parsed.data;
  try {
    const session = await deps.stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: d.correo,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "mxn",
            unit_amount: DIAGNOSTICO_CENTAVOS,
            product_data: {
              name: "Diagnóstico Súmmum 360",
              description: "Si después del diagnóstico avanzas con tu mejora interna y externa, se abona a tu primer servicio.",
            },
          },
        },
      ],
      metadata: {
        tipo: "diagnostico_360",
        abona_primer_servicio: "true",
        nombre: d.nombre,
        negocio: d.negocio,
        telefono: d.telefono,
        perfil: d.perfil,
        frena: d.frena,
      },
      success_url: `${deps.baseUrl}/diagnostico/gracias`,
      cancel_url: `${deps.baseUrl}/diagnostico`,
    });
    if (!session.url) return { ok: false, error: "Stripe no devolvió la liga de cobro." };
    return { ok: true, data: { url: session.url } };
  } catch {
    return { ok: false, error: "Stripe rechazó la operación." };
  }
}
