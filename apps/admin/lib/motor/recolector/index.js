// Junta la evidencia del Chequeo antes de la IA (spec 2026-10-05-chequeo-como-el-primero-design.md, sección 2).
// Cada pieza que falla queda como { ok: false, motivo } y las demás siguen. Nunca lanza.
// Una pieza del expediente previo se reusa si tiene menos de 7 días, salió ok y su enlace no cambió.
import { recolectarGoogle } from "./google.js";
import { recolectarInstagram } from "./instagram.js";
import { recolectarSitio } from "./sitio.js";

export const EXPEDIENTE_VIGENTE_MS = 7 * 86_400_000;

const seguro = (p) => p.catch((e) => ({ ok: false, motivo: String(e?.message ?? e) }));

export async function recolectar(c, { previo, sitio = recolectarSitio, instagram = recolectarInstagram, google = recolectarGoogle } = {}) {
  const enlaces = c.enlaces ?? {};
  // Lo que se busca en Google cuenta como su "enlace": si cambia el nombre o la ciudad, se busca otra vez.
  const consulta = c.tipo === "negocio" && c.negocio ? `${c.negocio}, ${c.ciudad}` : undefined;
  const actuales = { sitio: enlaces.sitio, instagram: enlaces.instagram, google: consulta };
  const vigente = previo?.fecha && Date.now() - new Date(previo.fecha) < EXPEDIENTE_VIGENTE_MS;
  const reusa = (pieza) => vigente && previo[pieza]?.ok === true && previo.enlaces?.[pieza] === actuales[pieza];
  const [s, ig, g] = await Promise.all([
    reusa("sitio") ? previo.sitio : enlaces.sitio ? seguro(sitio(enlaces.sitio)) : { ok: false, motivo: "No dio sitio web." },
    reusa("instagram") ? previo.instagram : seguro(instagram(enlaces.instagram)),
    reusa("google") ? previo.google : seguro(google(consulta)),
  ]);
  return { fecha: new Date().toISOString(), enlaces: actuales, sitio: s, instagram: ig, google: g };
}
