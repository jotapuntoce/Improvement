// Expedientes de proceso (skill documentar-proceso) guardados en apps/admin/procesos/<proyecto>/.
// Cada proyecto es una carpeta con su carpeta.json (nombre, estilo visual, descripción) y una
// subcarpeta por proceso con su expediente.json, capturas y PDF. Solo servidor: lee el disco.
// ponytail: viven en git (~6 MB por proceso); si el repo pesa demasiado, pasarlos a Supabase Storage.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const PROCESOS_DIR = path.join(process.cwd(), "procesos");

function leerJson(archivo) {
  return JSON.parse(readFileSync(archivo, "utf8"));
}

function subcarpetas(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/** Procesos de un proyecto, del más reciente al más viejo. */
export function listProcesos(proyecto, base = PROCESOS_DIR) {
  const dir = path.join(base, proyecto);
  return subcarpetas(dir)
    .filter((p) => existsSync(path.join(dir, p, "expediente.json")))
    .sort()
    .reverse()
    .map((carpeta) => ({ carpeta, ...leerJson(path.join(dir, carpeta, "expediente.json")) }));
}

/** Carpetas de proyecto (las que tienen carpeta.json) con su conteo de procesos. */
export function listProyectos(base = PROCESOS_DIR) {
  if (!existsSync(base)) return [];
  return subcarpetas(base)
    .filter((p) => existsSync(path.join(base, p, "carpeta.json")))
    .map((slug) => ({ slug, ...leerJson(path.join(base, slug, "carpeta.json")), total: listProcesos(slug, base).length }));
}

export function getProyecto(slug, base = PROCESOS_DIR) {
  return listProyectos(base).find((p) => p.slug === slug) ?? null;
}

/**
 * Ruta absoluta de un archivo pedido por URL, o null si sale de PROCESOS_DIR (../, rutas absolutas)
 * o no existe. Es la única puerta de lectura de la ruta /planos/archivo/*.
 */
export function resolveArchivo(partes, base = PROCESOS_DIR) {
  const destino = path.resolve(base, ...partes);
  if (!destino.startsWith(base + path.sep) || !existsSync(destino)) return null;
  return destino;
}

const TIPOS = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".md": "text/markdown; charset=utf-8", ".json": "application/json" };
export const tipoDe = (archivo) => TIPOS[path.extname(archivo).toLowerCase()] ?? "application/octet-stream";
