// Plantillas por giro: apps sugeridas además de las base (Clientes, Ventas, Proyectos, Postventa).
// Catálogo genérico, igual para todo negocio del mismo giro; lo de cada dueño vive en las filas que
// applyTemplate crea y que él cambia después.
// ponytail: en código y no en tabla app_template; pasa a tabla cuando las plantillas se editen desde admin.
import { findOwnerMembership } from "../auth/guard.ts";
import { createCustomApp } from "./custom.ts";
import { addField, type FieldType } from "./fields.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface TemplateApp {
  name: string;
  group: string;
  stages: string[];
  /** La llave de cada campo sale de su nombre (addField). */
  fields: { label: string; type: FieldType; options?: string[] }[];
}

const TAREAS: TemplateApp = {
  name: "Tareas del equipo", group: "Operación", stages: ["Por hacer", "En proceso", "Hecho"],
  fields: [{ label: "Responsable", type: "texto" }, { label: "Fecha límite", type: "fecha" }],
};
const INVENTARIO: TemplateApp = {
  name: "Inventario", group: "Operación", stages: ["Suficiente", "Por pedir", "Pedido"],
  fields: [{ label: "Proveedor", type: "texto" }, { label: "Costo", type: "dinero" }],
};

const TEMPLATES: Record<string, TemplateApp[]> = {
  general: [TAREAS],
  restaurante: [
    { name: "Reservaciones", group: "Ventas", stages: ["Solicitada", "Confirmada", "Atendida", "No llegó"],
      fields: [{ label: "Fecha", type: "fecha" }, { label: "Personas", type: "numero" }] },
    INVENTARIO,
    TAREAS,
  ],
  retail: [
    { name: "Productos", group: "Operación", stages: ["Disponible", "Bajo", "Agotado"],
      fields: [{ label: "SKU", type: "texto" }, { label: "Precio", type: "dinero" }] },
    { name: "Pedidos a proveedor", group: "Operación", stages: ["Por pedir", "Pedido", "Recibido"],
      fields: [{ label: "Proveedor", type: "texto" }, { label: "Monto", type: "dinero" }] },
    TAREAS,
  ],
  servicios: [
    { name: "Citas", group: "Ventas", stages: ["Agendada", "Confirmada", "Realizada", "Cancelada"],
      fields: [{ label: "Fecha", type: "fecha" }, { label: "Servicio", type: "texto" }] },
    TAREAS,
  ],
  salud: [
    { name: "Pacientes", group: "Ventas", stages: ["Primera vez", "En tratamiento", "Alta"],
      fields: [{ label: "Teléfono", type: "texto" }, { label: "Próxima cita", type: "fecha" }] },
    { name: "Citas", group: "Operación", stages: ["Agendada", "Confirmada", "Atendida", "No asistió"],
      fields: [{ label: "Fecha", type: "fecha" }, { label: "Motivo", type: "texto" }] },
    TAREAS,
  ],
  construccion: [
    { name: "Obras", group: "Operación", stages: ["Planeación", "En obra", "Entregada"],
      fields: [{ label: "Dirección", type: "texto" }, { label: "Presupuesto", type: "dinero" }] },
    { name: "Materiales", group: "Operación", stages: ["Por cotizar", "Pedido", "En obra"],
      fields: [{ label: "Proveedor", type: "texto" }, { label: "Costo", type: "dinero" }] },
    TAREAS,
  ],
  tecnologia: [
    { name: "Soporte", group: "Operación", stages: ["Abierto", "En revisión", "Resuelto"],
      fields: [{ label: "Prioridad", type: "opcion", options: ["Alta", "Media", "Baja"] }] },
    TAREAS,
  ],
  manufactura: [
    { name: "Órdenes de producción", group: "Operación", stages: ["Programada", "En producción", "Terminada"],
      fields: [{ label: "Cantidad", type: "numero" }, { label: "Fecha de entrega", type: "fecha" }] },
    INVENTARIO,
    TAREAS,
  ],
};

export function templateFor(industry: string | null): { key: string; apps: TemplateApp[] } {
  const key = industry && industry in TEMPLATES ? industry : "general";
  return { key, apps: TEMPLATES[key]! };
}

/** Crea las apps que el dueño eligió (o renombró) con sus campos; las que ya existen se saltan. */
export async function applyTemplate(userId: string, orgId: string, picks: TemplateApp[]): Promise<Result<{ created: string[] }>> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño arma su Improvement." } };
  const created: string[] = [];
  for (const app of picks) {
    const r = await createCustomApp(userId, orgId, { name: app.name, groupName: app.group, stages: app.stages });
    if (!r.ok) {
      if (r.error.code === "CONFLICT") continue;
      return r;
    }
    for (const f of app.fields) {
      const fr = await addField(userId, orgId, r.data.key, { label: f.label, type: f.type, options: f.options ?? [] });
      if (!fr.ok) return fr;
    }
    created.push(r.data.key);
  }
  return { ok: true, data: { created } };
}
