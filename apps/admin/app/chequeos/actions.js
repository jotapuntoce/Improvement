"use server";
// Borde del panel de chequeos: guard + FormData → lib/chequeos.js. Cada acción devuelve el resultado tipado para que
// components/chequeos/Formulario.js muestre el error.
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth.js";
import { aprobarChequeo, armarChequeo } from "@/lib/motor/armar.js";
import {
  anotarContacto,
  cambiarEtapa,
  crearChequeoPropio,
  fijarProximaAccion,
  guardarDatosPropio,
  guardarPdf,
  registrarCompra,
} from "@/lib/chequeos.js";

const campos = (fd) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

export async function crearPropioAction(_prev, fd) {
  await requirePlatformAdmin();
  const r = await crearChequeoPropio(campos(fd));
  if (!r.ok) return r;
  revalidatePath("/chequeos");
  redirect(`/chequeos/${r.data.id}`);
}

async function enChequeo(id, fn) {
  await requirePlatformAdmin();
  const r = await fn();
  revalidatePath(`/chequeos/${id}`);
  revalidatePath("/chequeos");
  return r;
}

export async function cambiarEtapaAction(id, _prev, fd) {
  return enChequeo(id, () => cambiarEtapa(id, fd.get("etapa")));
}
export async function anotarContactoAction(id, _prev, fd) {
  return enChequeo(id, () => anotarContacto(id, campos(fd)));
}
export async function proximaAccionAction(id, _prev, fd) {
  return enChequeo(id, () => fijarProximaAccion(id, { accion: fd.get("accion"), fecha: fd.get("fecha") }));
}
export async function compraAction(id, _prev, fd) {
  return enChequeo(id, () => registrarCompra(id, campos(fd)));
}
export async function pdfAction(id, _prev, fd) {
  return enChequeo(id, () => guardarPdf(id, fd.get("pdf")));
}

// El armado tarda minutos: corre después de responder y avisa por WhatsApp. La página muestra "Armando…".
export async function armarAction(id) {
  await requirePlatformAdmin();
  after(() => armarChequeo(id, { manual: true }));
  return { ok: true, data: null };
}
export async function rehacerAction(id, _prev, fd) {
  await requirePlatformAdmin();
  const nota = String(fd.get("nota") ?? "").trim();
  if (!nota) return { ok: false, error: { code: "DATOS_INVALIDOS", mensaje: "Escribe qué cambiar." } };
  after(() => armarChequeo(id, { manual: true, nota }));
  return { ok: true, data: null };
}
export async function aprobarAction(id) {
  return enChequeo(id, () => aprobarChequeo(id));
}
export async function datosPropioAction(id, _prev, fd) {
  const enlaces = Object.fromEntries([...fd.entries()].filter(([k]) => k.startsWith("enlace_")).map(([k, v]) => [k.slice(7), String(v)]));
  return enChequeo(id, () => guardarDatosPropio(id, { enlaces, nota: fd.get("nota") }));
}
