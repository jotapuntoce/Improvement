// Envío 2 de la landing: la entrevista, con la clave que devolvió el envío 1.
import { leer, preflight, responder } from "@/lib/cors.js";
import { guardarEntrevista } from "@/lib/chequeos.js";

const STATUS = { DATOS_INVALIDOS: 400, NO_ENCONTRADO: 404, YA_ENVIADA: 409 };

export const OPTIONS = preflight;

export async function PATCH(request, { params }) {
  const { origin, body, error } = await leer(request);
  if (error) return error;
  const { id } = await params;
  const r = await guardarEntrevista(id, body);
  return responder(origin, r.ok ? 200 : (STATUS[r.error.code] ?? 400), r);
}
