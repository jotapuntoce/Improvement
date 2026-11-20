"use server";
// Acciones de la oficina 2D: subir fotos (y analizarlas en el mismo paso) y confirmar el borrador.
// Los errores regresan a la página por ?error= — mismo patrón que la pantalla de marca.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { analyzeSpace } from "@/server/office/analyze.ts";
import { confirmOfficePlan } from "@/server/office/confirm.ts";
import { uploadSpacePhotos } from "@/server/office/photos.ts";
import { field } from "@/lib/format.ts";


function back(orgId: string, error?: string): never {
  const pagina = `/${orgId}/oficina`;
  if (error) redirect(`${pagina}?error=${encodeURIComponent(error)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function subirFotos(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  const orgId = field(formData, "orgId");
  const files = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  const subidas = await uploadSpacePhotos(userId, orgId, files);
  if (!subidas.ok) back(orgId, subidas.error.message);
  const analisis = await analyzeSpace(userId, orgId, subidas.data);
  back(orgId, analisis.ok ? undefined : analisis.error.message);
}

export async function confirmarOficina(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  const orgId = field(formData, "orgId");
  const total = Number(field(formData, "areas"));
  const areas = Array.from({ length: Number.isInteger(total) && total > 0 ? Math.min(total, 12) : 0 }, (_, i) => ({
    name: field(formData, `area-${i}-name`),
    color: field(formData, `area-${i}-color`),
    seats: field(formData, `area-${i}-seats`)
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((title) => ({ title })),
  }));
  const edited = {
    areas,
    theme: field(formData, "aplicarTema") === "si" ? parseJson(field(formData, "theme")) : null,
    logo: parseJson(field(formData, "logo")),
    notes: field(formData, "notes"),
  };
  const res = await confirmOfficePlan(userId, orgId, field(formData, "planId"), edited);
  back(orgId, res.ok ? undefined : res.error.message);
}
