// El canal del org: mensajes del equipo, encargos a los agentes y, para el dueño, activar agentes y
// el aviso del worker caído. Realtime (ChannelLive) solo refresca; quién ve qué lo deciden el guard y RLS.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { ensureAgents } from "@/server/agents/agents.ts";
import { workerStatus } from "@/server/agents/runtime.ts";
import { createEncargo } from "@/server/agents/tasks.ts";
import { listAreasByOrg } from "@/server/areas/listAreas.ts";
import { getSessionAccessToken, getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { deleteMessage, listChannels, listMessages, postMessage } from "@/server/channels/channels.ts";
import { ChannelLive } from "./ChannelLive.tsx";

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

function back(orgId: string, c: string, error?: string): never {
  const query = new URLSearchParams();
  if (c) query.set("c", c);
  if (error) query.set("error", error);
  revalidatePath(`/${orgId}/canal`);
  redirect(`/${orgId}/canal${query.size ? `?${query}` : ""}`);
}

async function sesion() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return userId;
}

async function publicar(formData: FormData) {
  "use server";
  const userId = await sesion();
  const [orgId, c] = [field(formData, "orgId"), field(formData, "c")];
  const res = await postMessage(userId, orgId, c, field(formData, "body"));
  back(orgId, c, res.ok ? undefined : res.error.message);
}

async function borrar(formData: FormData) {
  "use server";
  const userId = await sesion();
  const [orgId, c] = [field(formData, "orgId"), field(formData, "c")];
  const res = await deleteMessage(userId, orgId, field(formData, "messageId"));
  back(orgId, c, res.ok ? undefined : res.error.message);
}

async function encargar(formData: FormData) {
  "use server";
  const userId = await sesion();
  const [orgId, c] = [field(formData, "orgId"), field(formData, "c")];
  const areaId = field(formData, "areaId");
  const res = await createEncargo(userId, orgId, { body: field(formData, "body"), areaId: areaId || undefined });
  back(orgId, c, res.ok ? undefined : res.error.message);
}

async function activarAgentes(formData: FormData) {
  "use server";
  const userId = await sesion();
  const [orgId, c] = [field(formData, "orgId"), field(formData, "c")];
  const res = await ensureAgents(userId, orgId);
  back(orgId, c, res.ok ? undefined : res.error.message);
}

export default async function CanalPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ c?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { c, error } = await searchParams;
  const { membership } = await requireSection(orgId, "canal");
  const userId = membership.userId;
  const esDueno = membership.role === "owner";

  const canales = await listChannels(userId, orgId);
  const lista = canales.ok ? canales.data : [];
  const actual = lista.find((x) => x.id === c) ?? lista.find((x) => x.kind === "general") ?? lista[0];
  const [mensajes, areas, worker, accessToken] = await Promise.all([
    actual ? listMessages(userId, orgId, actual.id) : null,
    listAreasByOrg([orgId]),
    esDueno ? workerStatus(new Date()) : null,
    getSessionAccessToken(),
  ]);
  const cActual = actual?.id ?? "";

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Canal</h1>
      {error && <p role="alert">{error}</p>}
      {worker?.stale && <p role="status">El trabajador de agentes no responde desde hace más de 3 minutos.</p>}

      {esDueno && (
        <form action={activarAgentes}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="c" value={cActual} />
          <button type="submit" className="jpc-back-link">
            Activar agentes
          </button>
        </form>
      )}

      {lista.length > 0 ? (
        <nav aria-label="Canales" className="flex flex-wrap gap-3">
          {lista.map((x) => (
            <Link
              key={x.id}
              href={`/${orgId}/canal?c=${x.id}`}
              aria-current={x.id === cActual ? "page" : undefined}
              className="jpc-back-link"
            >
              {x.name}
            </Link>
          ))}
        </nav>
      ) : (
        <p>Todavía no estás en ningún canal.</p>
      )}

      {actual && mensajes?.ok && (
        <section aria-labelledby="mensajes" className="space-y-4">
          <h2 id="mensajes" className="text-lg font-semibold">
            {actual.name}
          </h2>
          {accessToken && env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && (
            <ChannelLive
              channelId={actual.id}
              accessToken={accessToken}
              url={env.NEXT_PUBLIC_SUPABASE_URL}
              anonKey={env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
            />
          )}
          {mensajes.data.length ? (
            <ol className="space-y-3">
              {mensajes.data.map((m) => (
                <li key={m.id}>
                  <p className="font-semibold">{m.authorName}</p>
                  <p>{m.deleted ? <em>Mensaje borrado</em> : m.body}</p>
                  {!m.deleted && m.authorProfileId === userId && (
                    <form action={borrar}>
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="c" value={cActual} />
                      <input type="hidden" name="messageId" value={m.id} />
                      <button type="submit" className="jpc-back-link" aria-label={`Borrar mensaje: ${m.body.slice(0, 40)}`}>
                        Borrar
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p>Sin mensajes todavía.</p>
          )}
          <form action={publicar} className="space-y-2">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="c" value={cActual} />
            <label className="block">
              Mensaje
              <textarea name="body" required maxLength={4000} rows={2} className="block w-full" />
            </label>
            <button type="submit" className="jpc-back-link">
              Enviar
            </button>
          </form>
        </section>
      )}

      <section aria-labelledby="encargo" className="space-y-2">
        <h2 id="encargo" className="text-lg font-semibold">
          Encargar a un agente
        </h2>
        <form action={encargar} className="space-y-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="c" value={cActual} />
          <label className="block">
            Encargo
            <textarea name="body" required maxLength={2000} rows={2} className="block w-full" />
          </label>
          <label className="block">
            Área (opcional)
            <select name="areaId" defaultValue="" className="block">
              <option value="">Sin área</option>
              {(areas.get(orgId) ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="jpc-back-link">
            Encargar
          </button>
        </form>
      </section>
    </main>
  );
}
