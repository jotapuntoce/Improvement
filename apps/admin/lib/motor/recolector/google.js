// Google por la API oficial de Places (New): la calificación, cuántas opiniones y hasta 5 reseñas públicas del
// negocio. Las cifras las trae Google; la IA solo las lee. Sin llave, devuelve motivo y el motor sigue.
const CAMPOS = ["displayName", "formattedAddress", "rating", "userRatingCount", "googleMapsUri", "reviews"].map((c) => `places.${c}`).join(",");

export function resumir(p) {
  return {
    nombre: p.displayName?.text ?? "",
    direccion: p.formattedAddress ?? "",
    calificacion: p.rating ?? null,
    opiniones: p.userRatingCount ?? 0,
    mapa: p.googleMapsUri ?? null,
    resenas: (p.reviews ?? []).map((r) => ({
      autor: r.authorAttribution?.displayName ?? "",
      estrellas: r.rating ?? null,
      texto: (r.originalText?.text ?? r.text?.text ?? "").replace(/\s+/g, " ").trim(),
      cuando: r.relativePublishTimeDescription ?? "",
    })),
  };
}

export async function recolectarGoogle(consulta, { fetch: f = fetch, env = process.env } = {}) {
  if (!consulta) return { ok: false, motivo: "Sin nombre de negocio para buscar en Google." };
  if (!env.GOOGLE_PLACES_API_KEY) return { ok: false, motivo: "Google sin configurar (falta GOOGLE_PLACES_API_KEY)." };
  try {
    const res = await f("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": CAMPOS },
      body: JSON.stringify({ textQuery: consulta, languageCode: "es", pageSize: 1 }),
      signal: AbortSignal.timeout(15_000),
    });
    const cuerpo = await res.json();
    if (cuerpo.error) return { ok: false, motivo: `Google respondió: ${cuerpo.error.message}` };
    const p = cuerpo.places?.[0];
    if (!p) return { ok: false, motivo: `Google no encontró "${consulta}".` };
    return { ok: true, data: resumir(p) };
  } catch (e) {
    return { ok: false, motivo: `No se pudo llamar a Google: ${e?.message ?? e}` };
  }
}
