// Envío 1 de la landing: registro del chequeo gratis. Ruta pública (sin requirePlatformAdmin): la protegen CORS, la
// trampa `sitio_web` y la unicidad de la base. Contrato: Improvement\jotapuntoce\landing\chequeo-api.md.
import { randomUUID } from "node:crypto";
import { leer, preflight, responder } from "@/lib/cors.js";
import { registrarChequeo } from "@/lib/chequeos.js";

const STATUS = { DATOS_INVALIDOS: 400, YA_EXISTE: 409 };

export const OPTIONS = preflight;

export async function POST(request) {
  const { origin, body, error } = await leer(request);
  if (error) return error;
  // Un bot llenó el campo invisible: se le contesta "listo" y no se guarda nada.
  if (body?.sitio_web) return responder(origin, 201, { ok: true, data: { id: randomUUID(), clave: randomUUID() } });
  const r = await registrarChequeo(body);
  return responder(origin, r.ok ? 201 : (STATUS[r.error.code] ?? 400), r);
}
