// Junta la evidencia del Chequeo antes de la IA (spec 2026-10-05-chequeo-como-el-primero-design.md, sección 2).
// Cada pieza que falla queda como { ok: false, motivo } y las demás siguen. Nunca lanza.
import { recolectarInstagram } from "./instagram.js";
import { recolectarSitio } from "./sitio.js";

const seguro = (p) => p.catch((e) => ({ ok: false, motivo: String(e?.message ?? e) }));

export async function recolectar(c, { sitio = recolectarSitio, instagram = recolectarInstagram } = {}) {
  const enlaces = c.enlaces ?? {};
  const [s, ig] = await Promise.all([
    enlaces.sitio ? seguro(sitio(enlaces.sitio)) : { ok: false, motivo: "No dio sitio web." },
    seguro(instagram(enlaces.instagram)),
  ]);
  return { fecha: new Date().toISOString(), sitio: s, instagram: ig };
}
