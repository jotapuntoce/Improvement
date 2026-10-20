import { describe, expect, it, vi } from "vitest";
import { DIAGNOSTICO_CENTAVOS, crearCobroDiagnostico } from "../server/diagnostico/checkout.ts";

const valido = {
  nombre: "Laura",
  negocio: "Café Altamira",
  correo: "laura@cafealtamira.mx",
  telefono: "5512345678",
  perfil: "dueno",
  frena: "Las tardes están vacías.",
};

function fake(url: string | null = "https://checkout.stripe.test/s") {
  const create = vi.fn().mockResolvedValue({ url });
  return { create, deps: { stripe: { checkout: { sessions: { create } } } as never, baseUrl: "https://summum.test" } };
}

describe("crearCobroDiagnostico", () => {
  it("WHEN la solicitud es válida THE SYSTEM SHALL cobrar $7,500 MXN y devolver la liga de Stripe", async () => {
    const { create, deps } = fake();
    expect(await crearCobroDiagnostico(valido, deps)).toEqual({ ok: true, data: { url: "https://checkout.stripe.test/s" } });
    const params = create.mock.calls[0]![0];
    expect(DIAGNOSTICO_CENTAVOS).toBe(750_000);
    expect(params.line_items[0].price_data).toMatchObject({ currency: "mxn", unit_amount: 750_000 });
    expect(params.metadata).toMatchObject({ tipo: "diagnostico_360", abona_primer_servicio: "true", negocio: "Café Altamira" });
    expect(params.success_url).toBe("https://summum.test/diagnostico/gracias");
  });

  it("WHEN falta un dato THE SYSTEM SHALL no llamar a Stripe", async () => {
    const { create, deps } = fake();
    expect(await crearCobroDiagnostico({ ...valido, correo: "no-es-correo" }, deps)).toEqual({ ok: false, error: "Revisa los datos del formulario." });
    expect(create).not.toHaveBeenCalled();
  });

  it("WHEN Stripe falla THE SYSTEM SHALL devolver un Result de error, no lanzar", async () => {
    const create = vi.fn().mockRejectedValue(new Error("red"));
    const deps = { stripe: { checkout: { sessions: { create } } } as never, baseUrl: "https://summum.test" };
    expect(await crearCobroDiagnostico(valido, deps)).toEqual({ ok: false, error: "Stripe rechazó la operación." });
  });
});
