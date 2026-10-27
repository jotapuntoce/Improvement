// Cultura (blueprint summum-improvement, E5-T5): celebraciones automáticas e insights agregados de los
// check-ins. Sin puntos ni orden por desempeño; los insights nunca llevan un id, un nombre ni un valor por
// persona, y una semana con menos de 3 respuestas no muestra promedio (no se podría saber de quién es).
import { and, avg, count, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { checkin, membership, objective, profile } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { recentWeeks, weekStart } from "../direccion/scorecard/week.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const MIN_RESPONSES = 3;
const DAY_MS = 86_400_000;

export type Celebration =
  | { kind: "objetivo"; title: string; personName: string | null; on: Date }
  | { kind: "aniversario"; personName: string | null; years: number; on: string };

const MX_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" });
/** [año, mes, día] de una fecha en Ciudad de México. */
const mxParts = (d: Date) => MX_DATE.format(d).split("-").map(Number) as [number, number, number];

/** El próximo aniversario de `accepted` desde `now` (hoy incluido), en días y años cumplidos. */
function nextAnniversary(accepted: Date, now: Date) {
  const [ty, tm, td] = mxParts(now);
  const [ay, am, ad] = mxParts(accepted);
  const today = Date.UTC(ty, tm - 1, td);
  let year = ty;
  if (Date.UTC(year, am - 1, ad) < today) year += 1;
  const at = Date.UTC(year, am - 1, ad);
  return { inDays: (at - today) / DAY_MS, years: year - ay, on: new Date(at).toISOString().slice(0, 10) };
}

export async function celebrations(userId: string, orgId: string, now = new Date()): Promise<Celebration[]> {
  const { scope } = await resolveSection(userId, orgId, "equipo");
  if (scope === "ninguno") return [];
  const [done, members] = await Promise.all([
    db
      .select({ title: objective.title, personName: profile.fullName, on: objective.completedAt })
      .from(objective)
      .leftJoin(profile, eq(profile.id, objective.assignedEmployeeId))
      .where(and(eq(objective.orgId, orgId), eq(objective.status, "completed"), gte(objective.completedAt, new Date(now.getTime() - 7 * DAY_MS))))
      .orderBy(desc(objective.completedAt)),
    db
      .select({ personName: profile.fullName, acceptedAt: membership.acceptedAt })
      .from(membership)
      .innerJoin(profile, eq(profile.id, membership.userId))
      .where(and(eq(membership.orgId, orgId), isNotNull(membership.acceptedAt))),
  ]);
  const anniversaries = members.flatMap((m) => {
    const a = nextAnniversary(m.acceptedAt!, now);
    return a.inDays <= 7 && a.years >= 1 ? [{ kind: "aniversario" as const, personName: m.personName, years: a.years, on: a.on }] : [];
  });
  return [...done.map((d) => ({ kind: "objetivo" as const, title: d.title, personName: d.personName, on: d.on! })), ...anniversaries];
}

export type WeekInsight = { weekStart: string; responses: number; averageMood: number | null };

/** Las últimas 4 semanas, solo agregados. Dueño o `equipo: empresa`. */
export async function cultureInsights(userId: string, orgId: string, now = new Date()): Promise<Result<WeekInsight[]>> {
  const { scope } = await resolveSection(userId, orgId, "equipo");
  if (scope !== "empresa") return { ok: false, error: { code: "FORBIDDEN", message: "Solo quien ve a toda la empresa ve los insights de cultura." } };
  const weeks = recentWeeks(weekStart(now), 4);
  const rows = await db
    .select({ weekStart: checkin.weekStart, responses: count(), mood: avg(checkin.mood) })
    .from(checkin)
    .where(and(eq(checkin.orgId, orgId), inArray(checkin.weekStart, weeks)))
    .groupBy(checkin.weekStart);
  const byWeek = new Map(rows.map((r) => [r.weekStart, r]));
  return {
    ok: true,
    data: weeks.map((w) => {
      const r = byWeek.get(w);
      const responses = r?.responses ?? 0;
      return { weekStart: w, responses, averageMood: responses >= MIN_RESPONSES ? Math.round(Number(r!.mood)) : null };
    }),
  };
}
