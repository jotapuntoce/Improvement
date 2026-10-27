// Sirve los archivos de un expediente (PDF, capturas, bitácora) solo a Jose Carlos: viven fuera de
// public/ a propósito, porque los expedientes traen capturas y datos de clientes.
import { readFile } from "node:fs/promises";
import { requirePlatformAdmin } from "@/lib/auth.js";
import { resolveArchivo, tipoDe } from "@/lib/procesos.js";

export async function GET(_request, { params }) {
  await requirePlatformAdmin();
  const { ruta } = await params;
  const archivo = resolveArchivo(ruta);
  if (!archivo) return new Response("No encontrado", { status: 404 });
  return new Response(await readFile(archivo), {
    headers: { "content-type": tipoDe(archivo), "cache-control": "private, max-age=3600" },
  });
}
