// Vista previa de la plantilla con datos de muestra, para que el dueño apruebe las 4 portadas antes de encender el
// motor: /chequeos/muestra?etapa=idea|arrancando|creciendo|consolidado. No toca la base ni la IA.
import { requirePlatformAdmin } from "@/lib/auth.js";
import { htmlChequeo } from "@/lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, EMPRENDEDOR_MUESTRA, contenidoMuestra } from "@/lib/motor/muestra.js";
import { ETAPAS_PROSPECTO } from "@/lib/chequeoDatos.js";

export async function GET(request) {
  await requirePlatformAdmin();
  const pedida = new URL(request.url).searchParams.get("etapa");
  const etapa = ETAPAS_PROSPECTO.includes(pedida) ? pedida : "creciendo";
  const c = etapa === "idea" ? EMPRENDEDOR_MUESTRA : CHEQUEO_MUESTRA;
  return new Response(htmlChequeo(c, contenidoMuestra(etapa)), { headers: { "content-type": "text/html; charset=utf-8" } });
}
