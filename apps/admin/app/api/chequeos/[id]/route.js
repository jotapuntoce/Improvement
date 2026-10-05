// Envío 2 de la landing: la entrevista, con la clave que devolvió el envío 1. Si el motor está encendido
// (CHEQUEOS_MOTOR_AUTO=1, solo tras aprobar portadas y la prueba con Boreal), arma el Chequeo después de responder.
import { after } from "next/server";
import { leer, preflight, responder } from "@/lib/cors.js";
import { guardarEntrevista } from "@/lib/chequeos.js";
import { armarChequeo } from "@/lib/motor/armar.js";

const STATUS = { DATOS_INVALIDOS: 400, NO_ENCONTRADO: 404, YA_ENVIADA: 409 };

export const OPTIONS = preflight;

export async function PATCH(request, { params }) {
  const { origin, body, error } = await leer(request);
  if (error) return error;
  const { id } = await params;
  const r = await guardarEntrevista(id, body);
  if (r.ok && process.env.CHEQUEOS_MOTOR_AUTO === "1") after(() => armarChequeo(id));
  return responder(origin, r.ok ? 200 : (STATUS[r.error.code] ?? 400), r);
}
