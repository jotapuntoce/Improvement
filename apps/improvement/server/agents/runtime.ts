// Runtime de agentes. Funciones de sistema: no corren en nombre de nadie y solo las llama
// app/api/agentes/[tarea]/route.ts después de isAuthorizedBearer. El worker solo marca el ritmo.
import { createHash, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { agent, agentTask, channel, ownerMemory, workerHeartbeat } from "@jotapuntoce/db/schema";
import { generateStructured, type SuggestionProvider } from "../ai/gateway.ts";
import { buildEncargoPrompt, buildEncargoSystem, buildReportPrompt, REPORT_SYSTEM_PROMPT } from "../ai/prompts/agent.ts";
import { postAgentMessage } from "../channels/channels.ts";
import { rescheduleAll, syncAllGoogle } from "../calendar/sync.ts";
import { releaseExpired } from "../seats/hold.ts";
import type { Tarea } from "./tareas.ts";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function isAuthorizedBearer(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret) return false;
  return timingSafeEqual(sha256(header ?? ""), sha256(`Bearer ${secret}`));
}

/** `orgId` acota el trabajo a un org (lo usan las pruebas contra la base compartida). */
interface Deps {
  provider?: SuggestionProvider;
  orgId?: string;
  fetchImpl?: typeof fetch;
}

export async function runTarea(tarea: Tarea, now: Date, deps: Deps = {}): Promise<Record<string, unknown>> {
  switch (tarea) {
    case "heartbeat":
      await db
        .insert(workerHeartbeat)
        .values({ worker: "agentes", seenAt: now })
        .onConflictDoUpdate({ target: workerHeartbeat.worker, set: { seenAt: now } });
      return { seenAt: now };
    case "encargos":
      return { procesadas: await drainEncargos(now, deps) };
    case "reporte":
      return { publicados: await morningReports(now, deps) };
    case "agenda":
      return rescheduleAll(now, deps);
    case "google":
      return syncAllGoogle(now, deps);
    case "butacas":
      return { procesadas: await releaseExpired(now) };
  }
}

const MAX_ATTEMPTS = 3;
const replySchema = z.object({ reply: z.string().min(1).max(4000), done: z.boolean() });

interface ClaimedTask extends Record<string, unknown> {
  id: string;
  org_id: string;
  agent_id: string | null;
  channel_id: string | null;
  body: string;
  attempts: number;
}

async function drainEncargos(now: Date, { provider, orgId }: Deps): Promise<number> {
  const ts = now.toISOString();
  const lockedUntil = new Date(now.getTime() + 5 * 60_000).toISOString();
  // Un solo viaje: reclama hasta 3 y los marca en_proceso; skip locked evita que dos corridas tomen el mismo.
  const claimed = [
    ...(await db.execute<ClaimedTask>(sql`
      update agent_task set status = 'en_proceso', attempts = attempts + 1,
        locked_until = ${lockedUntil}::timestamptz, updated_at = ${ts}::timestamptz
      where id in (
        select id from agent_task
        where status in ('asignado', 'en_proceso')
          and (locked_until is null or locked_until < ${ts}::timestamptz)
          and attempts < ${MAX_ATTEMPTS}
          ${orgId ? sql`and org_id = ${orgId}` : sql``}
        order by created_at
        limit 3
        for update skip locked)
      returning id, org_id, agent_id, channel_id, body, attempts`)),
  ];
  if (!claimed.length) return 0;

  const agentIds = [...new Set(claimed.flatMap((t) => (t.agent_id ? [t.agent_id] : [])))];
  const agents = agentIds.length ? await db.select().from(agent).where(inArray(agent.id, agentIds)) : [];

  for (const task of claimed) {
    const a = agents.find((x) => x.id === task.agent_id);
    let reply: z.infer<typeof replySchema> | null = null;
    if (a && task.channel_id) {
      try {
        const memory =
          a.kind === "manager"
            ? await db
                .select({ question: ownerMemory.question, answer: ownerMemory.answer })
                .from(ownerMemory)
                .where(and(eq(ownerMemory.orgId, a.orgId), eq(ownerMemory.ownerId, a.ownerProfileId)))
                .orderBy(desc(ownerMemory.createdAt))
                .limit(20)
            : [];
        const res = await generateStructured({
          orgId: task.org_id,
          purpose: "agente",
          category: "agente",
          system: buildEncargoSystem(a, memory),
          prompt: buildEncargoPrompt(task),
          schema: replySchema,
          toText: (p) => p.reply,
          basedOn: { agent_task: [task.id] },
          provider,
        });
        if (res.ok) reply = res.data.parsed;
      } catch {
        // La IA falló: cuenta como intento y se reintenta abajo.
      }
    }

    const failed = !reply && (task.attempts >= MAX_ATTEMPTS || !a || !task.channel_id);
    const text = reply ? reply.reply : failed ? "No pude completar este encargo." : null;
    if (text && a && task.channel_id) await postAgentMessage(a.id, task.channel_id, text);
    await db
      .update(agentTask)
      .set({ status: reply?.done ? "hecho" : failed ? "fallido" : "asignado", result: reply?.reply, lockedUntil: null, updatedAt: now })
      .where(eq(agentTask.id, task.id));
  }
  return claimed.length;
}

const TZ = "America/Mexico_City";

function localParts(now: Date): { date: string; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

const reportSchema = z.object({ reporte: z.string().min(1).max(4000) });

async function morningReports(now: Date, { provider, orgId }: Deps): Promise<number> {
  const { date: today, hour } = localParts(now);
  if (hour < 8) return 0;
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  const pendientes = await db
    .select()
    .from(agent)
    .where(
      and(
        eq(agent.kind, "manager"),
        or(isNull(agent.lastReportOn), lt(agent.lastReportOn, today)),
        orgId ? eq(agent.orgId, orgId) : undefined,
      ),
    )
    .limit(5);

  let publicados = 0;
  for (const manager of pendientes) {
    // Se reclama antes de generar: dos corridas simultáneas no publican dos reportes.
    const [claimed] = await db
      .update(agent)
      .set({ lastReportOn: today })
      .where(and(eq(agent.id, manager.id), or(isNull(agent.lastReportOn), lt(agent.lastReportOn, today))))
      .returning({ id: agent.id });
    if (!claimed) continue;

    const [general, hechosAyer, abiertos] = await Promise.all([
      db
        .select({ id: channel.id })
        .from(channel)
        .where(and(eq(channel.orgId, manager.orgId), eq(channel.kind, "general"))),
      db
        .select({ body: agentTask.body, result: agentTask.result })
        .from(agentTask)
        .where(
          and(
            eq(agentTask.orgId, manager.orgId),
            eq(agentTask.status, "hecho"),
            sql`(${agentTask.updatedAt} at time zone ${TZ})::date = ${yesterday}::date`,
          ),
        ),
      db
        .select({ body: agentTask.body, status: agentTask.status })
        .from(agentTask)
        .where(and(eq(agentTask.orgId, manager.orgId), inArray(agentTask.status, ["recibido", "asignado", "en_proceso"]))),
    ]);
    if (!general[0]) continue;

    const res = await generateStructured({
      orgId: manager.orgId,
      purpose: "reporte",
      category: "agente",
      system: REPORT_SYSTEM_PROMPT,
      prompt: buildReportPrompt({ hechosAyer, abiertos }),
      schema: reportSchema,
      toText: (p) => p.reporte,
      basedOn: { agent: [manager.id] },
      provider,
    });
    if (!res.ok) {
      // Sin reporte: se libera el día para que la siguiente corrida lo intente de nuevo.
      await db.update(agent).set({ lastReportOn: manager.lastReportOn }).where(eq(agent.id, manager.id));
      continue;
    }
    await postAgentMessage(manager.id, general[0].id, res.data.parsed.reporte);
    publicados++;
  }
  return publicados;
}

const STALE_MS = 3 * 60_000;

export async function workerStatus(now: Date, worker = "agentes"): Promise<{ seenAt: Date | null; stale: boolean }> {
  const [row] = await db.select({ seenAt: workerHeartbeat.seenAt }).from(workerHeartbeat).where(eq(workerHeartbeat.worker, worker));
  if (!row) return { seenAt: null, stale: true };
  return { seenAt: row.seenAt, stale: now.getTime() - row.seenAt.getTime() > STALE_MS };
}
