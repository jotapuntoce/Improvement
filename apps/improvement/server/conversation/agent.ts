// La burbuja (H1–H3): apuntar una tarea propia y conversar. El dueño habla con Improvement (su
// memoria de dueño); un empleado, con el agente de su rol (su tipo de permiso, sus apps y su bandeja).
// La conversación es solo de quien la tiene: se lee por userId y no pasa por ai_suggestion.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { agentMessage, permissionType, profile } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { loadSidebar } from "../apps/sidebar.ts";
import { listInbox } from "../tasks/inbox.ts";
import { createTask } from "../tasks/inbox.ts";
import { listOwnerMemory, ownerBrief } from "../owner/memory.ts";
import { agenteBrief, learnFromChat, loadMiAgente } from "../equipo/agentes.ts";
import { extractStructured, type SuggestionProvider } from "../ai/gateway.ts";
import { OWNER_SYSTEM_PROMPT, ROLE_SYSTEM_PROMPT, buildConversationPrompt, conversationSchema } from "../ai/prompts/conversation.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR") => ({ ok: false as const, error: { code, message } });
const Text = z.string().trim().min(2, "Escribe al menos dos letras.").max(2000);

export type Message = { id: string; role: "persona" | "improvement"; body: string; createdAt: Date };

/** Las últimas `limit` de la conversación de la persona, de la más vieja a la más nueva. */
export async function listMessages(userId: string, orgId: string, limit = 50): Promise<Message[]> {
  await assertMembership(userId, orgId);
  const rows = await db
    .select({ id: agentMessage.id, role: agentMessage.role, body: agentMessage.body, createdAt: agentMessage.createdAt })
    .from(agentMessage)
    .where(and(eq(agentMessage.orgId, orgId), eq(agentMessage.userId, userId)))
    .orderBy(desc(agentMessage.createdAt))
    .limit(limit);
  return rows.reverse();
}

/** "Apuntar": lo dicho o escrito se vuelve una tarea propia en la bandeja, sin IA. */
export async function jot(userId: string, orgId: string, raw: unknown): Promise<Result<{ id: string }>> {
  const text = Text.safeParse(raw);
  if (!text.success) return fail(text.error.issues[0]?.message ?? "Datos inválidos.");
  const title = text.data.length > 120 ? `${text.data.slice(0, 117)}…` : text.data;
  return createTask(userId, orgId, { title, notes: text.data.length > 120 ? text.data : undefined });
}

/** "Preguntar": guarda la pregunta, arma el contexto según quién pregunta y guarda la respuesta. */
export async function ask(userId: string, orgId: string, raw: unknown, provider?: SuggestionProvider): Promise<Result<Message>> {
  const me = await assertMembership(userId, orgId);
  const text = Text.safeParse(raw);
  if (!text.success) return fail(text.error.issues[0]?.message ?? "Datos inválidos.");
  const historial = await listMessages(userId, orgId, 6);
  await db.insert(agentMessage).values({ orgId, userId, role: "persona", body: text.data });

  const [[person], inbox] = await Promise.all([
    db.select({ name: profile.fullName }).from(profile).where(eq(profile.id, userId)),
    listInbox(userId, orgId),
  ]);
  const pendientes = inbox.ok ? inbox.data.slice(0, 8).map((i) => `${i.title}${i.overdue ? " (vencida)" : ""}`) : [];
  let perfil: string;
  if (me.role === "owner") {
    perfil = ownerBrief(await listOwnerMemory(userId, orgId));
  } else {
    const [tipo] = me.permissionTypeId ? await db.select({ name: permissionType.name }).from(permissionType).where(eq(permissionType.id, me.permissionTypeId)) : [];
    const apps = (await loadSidebar(userId, orgId)).groups.flatMap((g) => g.apps.map((a) => a.name));
    perfil = `Rol: ${tipo?.name ?? "Equipo"}\nApps que ve: ${apps.join(", ") || "ninguna"}`;
    // Su agente: lo que le toca y dónde se le atora, para que la ayuda sea suya y no genérica.
    const mio = await loadMiAgente(userId, orgId);
    if (mio) perfil += `\n${agenteBrief(mio)}`;
  }

  const r = await extractStructured({
    orgId,
    purpose: "conversacion",
    system: me.role === "owner" ? OWNER_SYSTEM_PROMPT : ROLE_SYSTEM_PROMPT,
    prompt: buildConversationPrompt({ persona: person?.name ?? "Sin nombre", perfil, pendientes, historial, pregunta: text.data }),
    schema: conversationSchema,
    maxTokens: 800,
    provider,
  });
  if (!r.ok) return fail("Improvement no pudo contestar ahora. Tu pregunta quedó guardada.", "AI_UNAVAILABLE");
  // Lo nuevo que contó de su puesto se queda en su agente para la próxima.
  if (me.role !== "owner" && r.data.parsed.aprendido?.length) await learnFromChat(userId, orgId, r.data.parsed.aprendido);
  const [row] = await db
    .insert(agentMessage)
    .values({ orgId, userId, role: "improvement", body: r.data.parsed.respuesta })
    .returning({ id: agentMessage.id, role: agentMessage.role, body: agentMessage.body, createdAt: agentMessage.createdAt });
  return { ok: true, data: row! };
}
