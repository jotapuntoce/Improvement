// Calendario de trabajo interno (H4): todo lo que ya tiene fecha y la persona puede ver, por día.
// Su bandeja (tareas y objetivos con fecha) y los campos fecha de las apps propias que ve. Sin tabla
// propia: cada pieza sale de la función con guard de su pantalla.
// ponytail: bloques fijos que Improvement reacomoda, lote del mes y hábitos quedan para su propia pieza.
import { assertMembership } from "../auth/guard.ts";
import { getAppMeta, listRecords } from "../apps/records.ts";
import { listFields } from "../apps/fields.ts";
import { loadSidebar } from "../apps/sidebar.ts";
import { listInbox } from "../tasks/inbox.ts";

export type AgendaItem = { kind: "tarea" | "objetivo" | "registro"; title: string; href: string };
export type AgendaDay = { day: string; items: AgendaItem[] };

const DAY_MS = 86_400_000;
const cdmxDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);

/** Los días entre `from` y `from + days` que tienen algo, en orden. */
export async function agenda(userId: string, orgId: string, from = new Date(), days = 28): Promise<AgendaDay[]> {
  await assertMembership(userId, orgId);
  const first = cdmxDay(from);
  const last = cdmxDay(new Date(from.getTime() + (days - 1) * DAY_MS));
  const byDay = new Map<string, AgendaItem[]>();
  const put = (day: string, item: AgendaItem) => {
    if (day < first || day > last) return;
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  };

  const inbox = await listInbox(userId, orgId);
  for (const i of inbox.ok ? inbox.data : []) if (i.dueAt) put(cdmxDay(i.dueAt), { kind: i.kind, title: i.title, href: i.href });

  for (const a of (await loadSidebar(userId, orgId)).groups.flatMap((g) => g.apps)) {
    if ((await getAppMeta(orgId, a.key))?.kind !== "custom") continue;
    const dates = (await listFields(userId, orgId, a.key)).filter((f) => f.type === "fecha");
    if (!dates.length) continue;
    const r = await listRecords(userId, orgId, a.key);
    if (!r.ok) continue;
    for (const rec of r.data.records) {
      for (const f of dates) {
        const v = rec.custom[f.key];
        if (typeof v === "string") put(v.slice(0, 10), { kind: "registro", title: `${rec.title} · ${f.label}`, href: `/${orgId}/a/${a.key}/${rec.id}` });
      }
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, items }));
}
