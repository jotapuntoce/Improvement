// Junta la evidencia del Chequeo antes de la IA (spec 2026-10-05-chequeo-como-el-primero-design.md, sección 2).
// Cada pieza que falla queda como { ok: false, motivo } y las demás siguen. Nunca lanza.
// Una pieza del expediente previo se reusa si tiene menos de 7 días, salió ok y su enlace no cambió.
import { recolectarInstagram } from "./instagram.js";
import { recolectarSitio } from "./sitio.js";

export const EXPEDIENTE_VIGENTE_MS = 7 * 86_400_000;

const seguro = (p) => p.catch((e) => ({ ok: false, motivo: String(e?.message ?? e) }));

export async function recolectar(c, { previo, sitio = recolectarSitio, instagram = recolectarInstagram } = {}) {
  const enlaces = c.enlaces ?? {};
  const vigente = previo?.fecha && Date.now() - new Date(previo.fecha) < EXPEDIENTE_VIGENTE_MS;
  const reusa = (pieza) => vigente && previo[pieza]?.ok === true && previo.enlaces?.[pieza] === enlaces[pieza];
  const [s, ig] = await Promise.all([
    reusa("sitio") ? previo.sitio : enlaces.sitio ? seguro(sitio(enlaces.sitio)) : { ok: false, motivo: "No dio sitio web." },
    reusa("instagram") ? previo.instagram : seguro(instagram(enlaces.instagram)),
  ]);
  return { fecha: new Date().toISOString(), enlaces: { sitio: enlaces.sitio, instagram: enlaces.instagram }, sitio: s, instagram: ig };
}
