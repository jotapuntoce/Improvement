// CORS de la puerta pública de chequeos: solo los orígenes de CHEQUEOS_ORIGENES (coma-separados), es decir, la
// landing. Se lee en cada llamada para no depender del momento del import (y para que las pruebas lo puedan fijar).
export function origenPermitido(request) {
  const origin = request.headers.get("origin");
  const permitidos = (process.env.CHEQUEOS_ORIGENES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return origin && permitidos.includes(origin) ? origin : null;
}

export function responder(origin, status, body) {
  const headers = { "content-type": "application/json", vary: "Origin" };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, PATCH, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

export function preflight(request) {
  const origin = origenPermitido(request);
  return responder(origin, origin ? 204 : 403, null);
}

/** Origen permitido + JSON del cuerpo, o la respuesta de error ya armada. */
export async function leer(request) {
  const origin = origenPermitido(request);
  if (!origin) return { error: responder(null, 403, { ok: false, error: { code: "ORIGEN" } }) };
  try {
    return { origin, body: await request.json() };
  } catch {
    return { error: responder(origin, 400, { ok: false, error: { code: "DATOS_INVALIDOS", campos: {} } }) };
  }
}
